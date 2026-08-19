import type { NextFunction, Request, Response } from "express";
import type { Collections } from "@/db/client";
import { AppError } from "@/common/errors";

declare module "express-serve-static-core" {
  interface Request {
    admin?: { companyId: string; name: string };
  }
}

/**
 * Company-admin authentication.
 *
 * Separate from rep auth on purpose. A rep token grants exactly one ability —
 * hand in a recording — while an admin token can read the whole company's
 * field intelligence and rewrite its master data. Conflating them would mean
 * a phone lost in a market leaks the outlet coverage of a national brand.
 */
export function adminAuth(collections: Collections) {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const header = req.header("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (token.length === 0) throw new AppError("missing bearer token", 401, "unauthenticated");

      const company = await collections.companies.findOne({ adminToken: token } as never);
      if (!company) throw new AppError("invalid admin token", 401, "unauthenticated");

      req.admin = { companyId: company.companyId, name: company.name };
      next();
    } catch (err) {
      next(err);
    }
  };
}
