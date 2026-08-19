import type { NextFunction, Request, Response } from "express";
import type { Collections } from "@/db/client";
import { requireAuth, requireRole } from "@/auth/middleware";

declare module "express-serve-static-core" {
  interface Request {
    admin?: { companyId: string; name: string };
  }
}

/**
 * Console access: owner or admin only.
 *
 * Deliberately not the same guard as a rep's. A rep token grants exactly one
 * ability — hand in a recording — while this one reads the company's whole
 * field intelligence and rewrites its master data. A phone lost in a market
 * must not leak a national brand's outlet coverage.
 */
export function adminAuth(_collections: Collections) {
  const auth = requireAuth();
  const role = requireRole("owner", "admin");

  return function (req: Request, res: Response, next: NextFunction): void {
    auth(req, res, (err?: unknown) => {
      if (err) return next(err);
      role(req, res, (err2?: unknown) => {
        if (err2) return next(err2);
        req.admin = { companyId: req.auth!.companyId, name: req.auth!.name };
        next();
      });
    });
  };
}
