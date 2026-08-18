import type { NextFunction, Request, Response } from "express";
import type { Collections } from "@/db/client";
import { AppError } from "@/common/errors";

declare module "express-serve-static-core" {
  interface Request {
    rep?: { repId: string; companyId: string; brandPortfolio: string[] };
  }
}

/**
 * Resolves a field representative from their invite token.
 *
 * Reps are PROVISIONED, never self-registered. No FMCG company will let
 * anyone claiming to be a rep sign up and pull down their SKU master, outlet
 * list and territory coverage — that is competitive intelligence. An admin
 * imports the roster and the system issues tokens.
 *
 * The token is a bearer credential: whoever holds it is the rep. That is
 * appropriate for a device-bound field app and is why tokens are never logged
 * or returned by any endpoint.
 */
export function repAuth(collections: Collections) {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const header = req.header("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (token.length === 0) throw new AppError("missing bearer token", 401, "unauthenticated");

      const rep = await collections.reps.findOne({ inviteToken: token, active: true });
      if (!rep) throw new AppError("invalid token", 401, "unauthenticated");

      req.rep = {
        repId: rep.repId,
        companyId: rep.companyId,
        brandPortfolio: rep.brandPortfolio ?? [],
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
