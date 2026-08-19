import type { Queue } from "bullmq";
import type { Observation } from "@shared/observation.schema";
import type { Annotations } from "@shared/stage-io";
import type { Clarification } from "@shared/clarification.schema";
import type { Collections } from "@/db/client";
import type { ObservationRepository } from "@/observations/repository";
import type { RealtimeGateway } from "@/realtime/gateway";
import type { ClarificationTimeoutJob } from "@/queue/queues";
import { NotFoundError, ValidationError } from "@/common/errors";
import { logger } from "@/common/logger";
import { buildClarifications } from "./builder";

export class ClarificationService {
  constructor(
    private readonly c: Collections,
    private readonly repo: ObservationRepository,
    private readonly realtime: RealtimeGateway,
    private readonly timeoutQueue: Queue<ClarificationTimeoutJob> | null,
    private readonly timeoutHours = 24,
  ) {}

  /**
   * Create prompts for a freshly scored observation.
   *
   * Each prompt gets its OWN delayed job scheduled at creation time, which is
   * why there is no sweeper anywhere in this codebase: a prompt cannot pile up
   * unresolved, because its resolution was scheduled the moment it existed.
   */
  async createFor(
    observation: Observation,
    annotations: Annotations,
    now = new Date(),
  ): Promise<Clarification[]> {
    const items = buildClarifications(observation, annotations, now, {
      timeoutHours: this.timeoutHours,
    });
    if (items.length === 0) return [];

    await this.c.clarifications.insertMany(items);

    for (const item of items) {
      await this.timeoutQueue?.add(
        "clarification-timeout",
        { clarificationId: item.clarificationId, companyId: item.companyId },
        {
          jobId: item.clarificationId,
          delay: this.timeoutHours * 3_600_000,
        },
      );
    }

    logger.debug(
      { observationId: observation.observationId, prompts: items.length },
      "clarifications created",
    );
    return items;
  }

  /** The rep's end-of-route batch. */
  async pendingForRep(companyId: string, repId: string, limit = 20): Promise<Clarification[]> {
    return this.c.clarifications
      .find({ companyId, repId, status: "pending" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Record an answer and patch the parent observation.
   *
   * Accepts answers to prompts that have ALREADY auto-resolved. That case is
   * easy to overlook and expensive to get wrong: the observation was confirmed
   * with a best guess and pushed to a dashboard, and a late correction must
   * still land and re-emit rather than being discarded as stale.
   */
  async answer(
    companyId: string,
    repId: string,
    clarificationId: string,
    value: string | number,
  ): Promise<{ clarification: Clarification; observation: Observation | null }> {
    const clr = await this.c.clarifications.findOne({ clarificationId, companyId, repId });
    if (!clr) throw new NotFoundError("clarification");

    if (clr.status === "answered") throw new ValidationError("already answered");
    if (clr.status === "cancelled") throw new ValidationError("no longer applicable");

    const allowed = clr.options.some((o) => String(o.value) === String(value));
    if (!allowed) throw new ValidationError("value is not one of the offered options");

    const late = clr.status === "auto_resolved";
    const now = new Date().toISOString();

    const updated: Clarification = {
      ...clr,
      status: "answered",
      answeredValue: value,
      answeredAt: now,
      answeredLate: late,
    };
    await this.c.clarifications.updateOne({ clarificationId }, { $set: updated });

    const observation = await this.applyToObservation(clr.observationId, clr.field, value);
    if (observation) this.realtime.observationUpdated(companyId, observation);

    if (late) {
      logger.info(
        { clarificationId, observationId: clr.observationId },
        "late clarification answer applied after auto-resolution",
      );
    }

    return { clarification: updated, observation };
  }

  /**
   * Timeout handler: keep the best guess, drop the flag, leave a trail.
   *
   * The record becomes usable rather than staying permanently uncertain, but
   * `auto_resolved` on the prompt means nobody can later mistake a guess for a
   * confirmation.
   */
  async autoResolve(clarificationId: string): Promise<void> {
    const clr = await this.c.clarifications.findOne({ clarificationId });
    if (!clr || clr.status !== "pending") return;

    await this.c.clarifications.updateOne(
      { clarificationId },
      { $set: { status: "auto_resolved" } },
    );

    const obs = await this.repo.getObservation(clr.observationId);
    if (!obs) return;

    const remaining = obs.flaggedFields.filter((f) => f !== clr.field);
    const updated = await this.repo.patchObservation(clr.observationId, {
      flaggedFields: remaining,
      status: remaining.length === 0 ? "confirmed" : "needs_clarification",
    });

    if (updated) this.realtime.observationUpdated(clr.companyId, updated);
    logger.debug({ clarificationId }, "clarification auto-resolved");
  }

  /** Withdraw outstanding prompts once HQ has corrected the record by hand. */
  async cancelFor(observationId: string): Promise<number> {
    const res = await this.c.clarifications.updateMany(
      { observationId, status: "pending" },
      { $set: { status: "cancelled" } },
    );
    return res.modifiedCount;
  }

  private async applyToObservation(
    observationId: string,
    field: string,
    value: string | number,
  ): Promise<Observation | null> {
    const obs = await this.repo.getObservation(observationId);
    if (!obs) return null;

    const remaining = obs.flaggedFields.filter((f) => f !== field);
    return this.repo.patchObservation(observationId, {
      [field]: value,
      // A human answered, so this field is now certain by definition.
      fieldConfidence: { ...obs.fieldConfidence, [field]: 1 },
      flaggedFields: remaining,
      status: remaining.length === 0 ? "confirmed" : "needs_clarification",
    } as Partial<Observation>);
  }
}
