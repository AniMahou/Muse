import type { NextFunction, Request, Response } from "express";
import type { Collections } from "@/db/client";
import { AppError } from "@/common/errors";
import { requireAuth, requireRep } from "@/auth/middleware";

declare module "express-serve-static-core" {
  interface Request {
    rep?: { repId: string; companyId: string; brandPortfolio: string[] };
  }
}

/**
 * Resolve the field representative behind a JWT.
 *
 * Runs requireAuth and requireRep first, then loads the Rep record so handlers
 * get the brand portfolio — which is not in the token, because it changes when
 * an admin reassigns a territory and a stale copy would silently narrow the
 * resolver's candidate set to the wrong products.
 */
export function repAuth(collections: Collections) {
  const auth = requireAuth();
  const rep = requireRep();

  return function (req: Request, res: Response, next: NextFunction): void {
    auth(req, res, (err?: unknown) => {
      if (err) return next(err);
      rep(req, res, async (err2?: unknown) => {
        if (err2) return next(err2);
        try {
          const claims = req.auth;
          if (!claims?.repId) throw new AppError("no rep record", 403, "forbidden");

          const record = await collections.reps.findOne({
            repId: claims.repId,
            companyId: claims.companyId,
            active: true,
          });
          if (!record) throw new AppError("rep record not found", 403, "forbidden");

          req.rep = {
            repId: record.repId,
            companyId: record.companyId,
            brandPortfolio: record.brandPortfolio ?? [],
          };
          next();
        } catch (e) {
          next(e);
        }
      });
    });
  };
}
