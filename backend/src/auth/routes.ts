import { Router, type Request, type Response, type NextFunction } from "express";
import {
  InviteRequestSchema, LoginRequestSchema, RegisterRequestSchema,
} from "@shared/auth.schema";
import { AppError, ValidationError } from "@/common/errors";
import type { AuthService } from "./service";
import { requireAuth, requireRole } from "./middleware";

export function authRoutes(auth: AuthService): Router {
  const r = Router();
  const wrap =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  r.post("/auth/register", wrap(async (req, res) => {
    const body = RegisterRequestSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError("invalid registration", body.error.issues);
    res.status(201).json(await auth.register(body.data));
  }));

  r.post("/auth/login", wrap(async (req, res) => {
    const body = LoginRequestSchema.safeParse(req.body);
    if (!body.success) throw new ValidationError("invalid login", body.error.issues);
    res.json(await auth.login(body.data));
  }));

  r.get("/auth/me", requireAuth(), wrap(async (req, res) => {
    if (!req.auth) throw new AppError("unauthenticated", 401, "unauthenticated");
    res.json(await auth.me(req.auth.userId));
  }));

  r.post(
    "/auth/invite",
    requireAuth(),
    requireRole("owner", "admin"),
    wrap(async (req, res) => {
      const body = InviteRequestSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("invalid invite", body.error.issues);
      if (!req.auth) throw new AppError("unauthenticated", 401, "unauthenticated");
      res.status(201).json({ user: await auth.invite(req.auth.companyId, body.data) });
    }),
  );

  r.get(
    "/auth/users",
    requireAuth(),
    requireRole("owner", "admin"),
    wrap(async (req, res) => {
      if (!req.auth) throw new AppError("unauthenticated", 401, "unauthenticated");
      res.json({ users: await auth.listUsers(req.auth.companyId) });
    }),
  );

  return r;
}
