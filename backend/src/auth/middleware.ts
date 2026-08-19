import type { NextFunction, Request, Response } from "express";
import type { Role } from "@shared/auth.schema";
import { AppError } from "@/common/errors";
import { verifyToken } from "./jwt";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      companyId: string;
      role: Role;
      repId: string | null;
      email: string;
      name: string;
    };
  }
}

/** Attach the caller's identity, or 401. */
export function requireAuth() {
  return function (req: Request, _res: Response, next: NextFunction): void {
    try {
      const header = req.header("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (!token) throw new AppError("missing bearer token", 401, "unauthenticated");

      const claims = verifyToken(token);
      req.auth = {
        userId: claims.sub,
        companyId: claims.companyId,
        role: claims.role,
        repId: claims.repId,
        email: claims.email,
        name: claims.name,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Restrict a route to certain roles.
 *
 * 403 rather than 404 on a role mismatch. Hiding a route's existence from
 * someone already authenticated inside the same company buys nothing and makes
 * the failure much harder to debug.
 */
export function requireRole(...roles: Role[]) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    if (!req.auth) return next(new AppError("unauthenticated", 401, "unauthenticated"));
    if (!roles.includes(req.auth.role)) {
      return next(new AppError(`requires role: ${roles.join(" or ")}`, 403, "forbidden"));
    }
    next();
  };
}

/** A field rep must have a linked Rep record before they can record anything. */
export function requireRep() {
  return function (req: Request, _res: Response, next: NextFunction): void {
    if (!req.auth) return next(new AppError("unauthenticated", 401, "unauthenticated"));
    if (req.auth.role !== "rep" || !req.auth.repId) {
      return next(new AppError("this endpoint is for field representatives", 403, "forbidden"));
    }
    next();
  };
}
