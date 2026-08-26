import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AppError, ValidationError } from "@/common/errors";
import type { Collections } from "@/db/client";
import type { ObservationRepository } from "@/observations/repository";
import type { CatalogImportService } from "@/catalog/import.service";
import type { AliasService } from "@/catalog/alias.service";
import type { AnalyticsService } from "@/analytics/service";
import type { ClarificationService } from "@/clarification/service";
import type { AlertService } from "@/alerts/service";
import { adminAuth } from "./auth.middleware";

const RangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/** Default window: the last 30 days, which is a sales cycle. */
function range(q: unknown) {
  const parsed = RangeQuery.safeParse(q);
  const now = new Date();
  const from = parsed.success && parsed.data.from
    ? parsed.data.from
    : new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const to = parsed.success && parsed.data.to ? parsed.data.to : now.toISOString();
  return { from, to };
}

export interface AdminDeps {
  collections: Collections;
  repo: ObservationRepository;
  imports: CatalogImportService;
  aliases: AliasService;
  analytics: AnalyticsService;
  clarifications: ClarificationService;
  alerts: AlertService;
}

export function adminRoutes(d: AdminDeps): Router {
  const r = Router();
  r.use(adminAuth(d.collections));

  const company = (req: Request): string => {
    if (!req.admin) throw new AppError("unauthenticated", 401, "unauthenticated");
    return req.admin.companyId;
  };
  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  // ---- observations & review --------------------------------------------

  r.get("/observations", wrap(async (req, res) => {
    const status = req.query.status as string | undefined;
    const limit = Number(req.query.limit ?? 100);
    const rows = await d.repo.listForCompany(company(req), {
      ...(status ? { status: status as never } : {}),
      limit,
    });
    res.json({ observations: rows });
  }));

  r.get("/review", wrap(async (req, res) => {
    const rows = await d.repo.listForCompany(company(req), {
      status: "needs_clarification",
      limit: Number(req.query.limit ?? 50),
    });
    res.json({ observations: rows });
  }));

  /**
   * A human correction.
   *
   * Sets confidence to 1 for corrected fields and cancels any outstanding
   * prompt for the same record — asking a rep about something HQ has already
   * decided wastes the one interaction he will tolerate.
   */
  r.post("/observations/:id/correct", wrap(async (req, res) => {
    const body = z
      .object({
        patch: z.record(z.string(), z.unknown()),
        reviewedBy: z.string().default("admin"),
      })
      .safeParse(req.body);
    if (!body.success) throw new ValidationError("invalid correction", body.error.issues);

    const id = req.params.id ?? "";
    const existing = await d.repo.getObservation(id);
    if (!existing || existing.companyId !== company(req)) {
      throw new AppError("observation not found", 404, "not_found");
    }

    const fields = Object.keys(body.data.patch);
    const updated = await d.repo.patchObservation(id, {
      ...(body.data.patch as Record<string, never>),
      fieldConfidence: {
        ...existing.fieldConfidence,
        ...Object.fromEntries(fields.map((f) => [f, 1])),
      },
      flaggedFields: existing.flaggedFields.filter((f) => !fields.includes(f)),
      status: "corrected",
    });

    await d.clarifications.cancelFor(id);
    res.json({ observation: updated });
  }));

  // ---- alerts ------------------------------------------------------------

  /**
   * The console's action queue.
   *
   * Open alerts first, then answered ones — a reviewer wants what still needs
   * a response, with the recent history underneath for context rather than on
   * a separate screen.
   */
  r.get("/alerts", wrap(async (req, res) => {
    const status = req.query.status as string | undefined;
    res.json({
      alerts: await d.alerts.list(company(req), {
        ...(status ? { status: status as never } : {}),
        limit: Number(req.query.limit ?? 50),
      }),
    });
  }));

  /**
   * A human takes an alert, or decides it does not merit action.
   *
   * Both stop the clock. "We looked and chose not to act" is a real response,
   * and treating it as a non-response would make the median reward acting on
   * things that did not deserve it.
   */
  r.post("/alerts/:id/respond", wrap(async (req, res) => {
    const body = z
      .object({
        status: z.enum(["acknowledged", "dismissed"]).default("acknowledged"),
        by: z.string().default("admin"),
        note: z.string().max(500).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) throw new ValidationError("invalid response", body.error.issues);

    const updated = await d.alerts.respond(
      company(req),
      req.params.id ?? "",
      body.data.status,
      body.data.by,
      body.data.note,
    );
    // Already answered by somebody else, or never existed. Same 404 either
    // way: two people clicking the same alert should not produce a 500.
    if (!updated) throw new AppError("alert not found or already answered", 404, "not_found");
    res.json({ alert: updated });
  }));

  /**
   * Time-to-response.
   *
   * The one operational number this product can honestly claim to move. Muse
   * does not fix a stock-out — that is the distributor's job. It compresses
   * how long it takes anyone to know, and this measures exactly that, with
   * both ends of the clock inside the system.
   */
  r.get("/alerts/stats", wrap(async (req, res) => {
    res.json(await d.alerts.responsiveness(company(req), range(req.query).from));
  }));

  // ---- alias approvals ---------------------------------------------------

  r.get("/aliases/pending", wrap(async (req, res) => {
    res.json({ candidates: await d.aliases.pending(company(req), Number(req.query.limit ?? 50)) });
  }));

  r.post("/aliases/:id/approve", wrap(async (req, res) => {
    const body = z
      .object({ skuId: z.string().optional(), reviewedBy: z.string().default("admin") })
      .safeParse(req.body ?? {});
    if (!body.success) throw new ValidationError("invalid approval", body.error.issues);

    const alias = await d.aliases.approve(
      company(req),
      req.params.id ?? "",
      body.data.reviewedBy,
      body.data.skuId,
    );
    res.json({ alias });
  }));

  r.post("/aliases/:id/reject", wrap(async (req, res) => {
    const reviewedBy = (req.body?.reviewedBy as string) ?? "admin";
    await d.aliases.reject(company(req), req.params.id ?? "", reviewedBy);
    res.status(204).end();
  }));

  // ---- catalogue import --------------------------------------------------

  const importer = (kind: "skus" | "outlets" | "reps") =>
    wrap(async (req: Request, res: Response) => {
      const csv = typeof req.body === "string" ? req.body : (req.body?.csv as string);
      if (!csv || csv.trim().length === 0) throw new ValidationError("empty CSV body");

      const report =
        kind === "skus"
          ? await d.imports.importSkus(company(req), csv)
          : kind === "outlets"
            ? await d.imports.importOutlets(company(req), csv)
            : await d.imports.importReps(company(req), csv);

      // 200 even with skipped rows: a partial import is a normal outcome and
      // the report is the point. Only a malformed header is an error.
      res.json({ report });
    });

  r.post("/catalog/skus", importer("skus"));
  r.post("/catalog/outlets", importer("outlets"));
  r.post("/catalog/reps", importer("reps"));

  // The console resolves ids to names everywhere it shows data, so it needs
  // the outlet list as well as the SKU list. A brand manager should never be
  // asked to read "OUT-1182".
  r.get("/catalog/outlets", wrap(async (req, res) => {
    const rows = await d.collections.outlets
      .find({ companyId: company(req) })
      .limit(Number(req.query.limit ?? 1000))
      .toArray();
    res.json({ outlets: rows.map(({ location: _l, ...o }) => o) });
  }));

  r.get("/catalog/skus", wrap(async (req, res) => {
    const rows = await d.collections.skus
      .find({ companyId: company(req) })
      .limit(Number(req.query.limit ?? 500))
      .toArray();
    res.json({ skus: rows });
  }));

  // ---- reps & territories ------------------------------------------------

  r.get("/reps", wrap(async (req, res) => {
    const rows = await d.collections.reps.find({ companyId: company(req) }).toArray();
    // Invite tokens are bearer credentials; they never leave the server.
    res.json({ reps: rows.map(({ inviteToken: _t, ...rest }) => rest) });
  }));

  /**
   * Territory and portfolio assignment.
   *
   * Not bookkeeping. `brandPortfolio` scopes the SKU candidate set stage 3
   * searches, turning a catalogue of thousands into the ~150 a rep actually
   * carries — which raises accuracy by removing confusable products the rep
   * could not possibly have said.
   */
  r.patch("/reps/:repId", wrap(async (req, res) => {
    const body = z
      .object({
        territoryId: z.string().nullable().optional(),
        brandPortfolio: z.array(z.string()).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new ValidationError("invalid rep patch", body.error.issues);

    const result = await d.collections.reps.findOneAndUpdate(
      { companyId: company(req), repId: req.params.repId ?? "" },
      { $set: body.data as Record<string, never> },
      { returnDocument: "after" },
    );
    if (!result) throw new AppError("rep not found", 404, "not_found");

    const { inviteToken: _t, ...rep } = result;
    res.json({ rep });
  }));

  // ---- analytics ---------------------------------------------------------

  r.get("/analytics/summary", wrap(async (req, res) => {
    res.json(await d.analytics.summary(company(req), range(req.query)));
  }));
  r.get("/analytics/share-of-voice", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.shareOfVoice(company(req), range(req.query)) });
  }));
  r.get("/analytics/stock-outs", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.stockOuts(company(req), range(req.query)) });
  }));
  r.get("/analytics/price-erosion", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.priceErosion(company(req), range(req.query)) });
  }));
  r.get("/analytics/rep-coverage", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.repCoverage(company(req), range(req.query)) });
  }));
  r.get("/analytics/trend", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.trend(company(req), range(req.query)) });
  }));
  r.get("/analytics/confidence", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.confidenceDistribution(company(req), range(req.query)) });
  }));
  r.get("/analytics/pipeline", wrap(async (req, res) => {
    res.json(await d.analytics.pipelineStats(company(req), range(req.query)));
  }));
  r.get("/analytics/types", wrap(async (req, res) => {
    res.json({ rows: await d.analytics.typeBreakdown(company(req), range(req.query)) });
  }));

  return r;
}
