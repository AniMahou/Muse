import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AppError, ValidationError } from "@/common/errors";
import type { Collections } from "@/db/client";
import type { ClarificationService } from "./service";
import { repAuth } from "@/ingest/auth.middleware";

/**
 * Rep-facing clarification endpoints.
 *
 * Both are shaped around one constraint: the rep is between outlets and will
 * give this fifteen seconds. Fetch returns a small batch; answering is a
 * single value from a fixed option list, never free text.
 */
export function clarificationRoutes(
  collections: Collections,
  service: ClarificationService,
): Router {
  const r = Router();
  // Per-route, for the same reason as ingest: mounted at /api alongside the
  // admin router.
  const auth = repAuth(collections);

  const rep = (req: Request) => {
    if (!req.rep) throw new AppError("unauthenticated", 401, "unauthenticated");
    return req.rep;
  };
  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  r.get("/clarifications", auth, wrap(async (req, res) => {
    const { companyId, repId } = rep(req);
    const items = await service.pendingForRep(companyId, repId, Number(req.query.limit ?? 20));
    res.json({
      clarifications: items.map((c) => ({
        clarificationId: c.clarificationId,
        clipId: c.clipId,
        kind: c.kind,
        question: c.question,
        options: c.options,
        confidence: c.confidence,
        createdAt: c.createdAt,
      })),
    });
  }));

  r.post("/clarifications/:id/answer", auth, wrap(async (req, res) => {
    const body = z
      .object({ value: z.union([z.string(), z.number()]) })
      .safeParse(req.body);
    if (!body.success) throw new ValidationError("invalid answer", body.error.issues);

    const { companyId, repId } = rep(req);
    const result = await service.answer(
      companyId,
      repId,
      req.params.id ?? "",
      body.data.value,
    );
    res.json({
      clarificationId: result.clarification.clarificationId,
      applied: result.observation !== null,
      // Surfaced so the app can say "thanks, that has been updated" rather
      // than silently accepting an answer to a question already resolved.
      late: result.clarification.answeredLate,
    });
  }));

  return r;
}
