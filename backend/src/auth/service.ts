import { randomUUID } from "node:crypto";
import type {
  AuthResponse, InviteRequest, LoginRequest, PublicUser, RegisterRequest, User,
} from "@shared/auth.schema";
import type { Collections } from "@/db/client";
import { AppError, ValidationError } from "@/common/errors";
import { logger } from "@/common/logger";
import { hashPassword, verifyPassword } from "./password";
import { signToken } from "./jwt";

export class AuthService {
  constructor(private readonly c: Collections) {}

  /**
   * Sign up: creates a company and its owner in one step.
   *
   * This models how the product is actually bought — an FMCG company onboards,
   * and the person who signs up owns it. There is deliberately no way to
   * self-register as a field representative.
   */
  async register(req: RegisterRequest): Promise<AuthResponse> {
    const email = req.email.trim().toLowerCase();
    if (await this.c.users.findOne({ email })) {
      throw new AppError("that email is already registered", 409, "email_taken");
    }

    const companyId = `co_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    await this.c.companies.insertOne({
      companyId,
      name: req.companyName.trim(),
      brands: [],
      isDemo: false,
    });

    const user: User = {
      userId: `usr_${randomUUID()}`,
      companyId,
      email,
      name: req.name.trim(),
      role: "owner",
      passwordHash: await hashPassword(req.password),
      repId: null,
      active: true,
      createdAt: now,
      lastLoginAt: now,
    };
    await this.c.users.insertOne(user);

    logger.info({ companyId, email }, "company registered");
    return this.session(user, req.companyName.trim());
  }

  async login(req: LoginRequest): Promise<AuthResponse> {
    const email = req.email.trim().toLowerCase();
    const user = await this.c.users.findOne({ email });

    // One message for both "no such user" and "wrong password". Distinguishing
    // them turns the login form into an account-enumeration oracle.
    const invalid = () => new AppError("email or password is incorrect", 401, "invalid_credentials");

    if (!user || !user.active) throw invalid();
    if (!(await verifyPassword(req.password, user.passwordHash))) throw invalid();

    const now = new Date().toISOString();
    await this.c.users.updateOne({ userId: user.userId }, { $set: { lastLoginAt: now } });

    const company = await this.c.companies.findOne({ companyId: user.companyId });
    return this.session({ ...user, lastLoginAt: now }, company?.name ?? "");
  }

  /**
   * Invite a teammate or a field rep.
   *
   * A rep invitation also creates their Rep record, because the two are one
   * concept: an account with a territory and a brand portfolio. The portfolio
   * is what scopes stage 3's candidate set, so creating an account without one
   * would quietly make that rep's matching worse.
   */
  async invite(companyId: string, req: InviteRequest): Promise<PublicUser> {
    const email = req.email.trim().toLowerCase();
    if (await this.c.users.findOne({ email })) {
      throw new ValidationError("that email is already registered");
    }

    const now = new Date().toISOString();
    let repId: string | null = null;

    if (req.role === "rep") {
      repId = `rep_${randomUUID().slice(0, 8)}`;
      await this.c.reps.insertOne({
        repId,
        companyId,
        name: req.name.trim(),
        territoryId: req.territoryId ?? undefined,
        brandPortfolio: req.brandPortfolio ?? [],
        active: true,
      });
    }

    const user: User = {
      userId: `usr_${randomUUID()}`,
      companyId,
      email,
      name: req.name.trim(),
      role: req.role,
      passwordHash: await hashPassword(req.password),
      repId,
      active: true,
      createdAt: now,
      lastLoginAt: null,
    };
    await this.c.users.insertOne(user);

    logger.info({ companyId, email, role: req.role }, "user invited");
    return toPublic(user);
  }

  async listUsers(companyId: string): Promise<PublicUser[]> {
    const rows = await this.c.users.find({ companyId }).sort({ createdAt: 1 }).toArray();
    return rows.map(toPublic);
  }

  /**
   * Restore a session from a stored token.
   *
   * Returns the company alongside the user because the client has no other
   * way to recover it on reload — the name is not in the token, and without
   * this the console falls back to a placeholder after every refresh.
   */
  async me(userId: string): Promise<{ user: PublicUser; company: { companyId: string; name: string } }> {
    const user = await this.c.users.findOne({ userId });
    if (!user) throw new AppError("user not found", 404, "not_found");

    const company = await this.c.companies.findOne({ companyId: user.companyId });
    return {
      user: toPublic(user),
      company: { companyId: user.companyId, name: company?.name ?? "" },
    };
  }

  private session(user: User, companyName: string): AuthResponse {
    return {
      token: signToken({
        sub: user.userId,
        companyId: user.companyId,
        role: user.role,
        repId: user.repId,
        email: user.email,
        name: user.name,
      }),
      user: toPublic(user),
      company: { companyId: user.companyId, name: companyName },
    };
  }
}

function toPublic(user: User): PublicUser {
  const { passwordHash: _omitted, ...rest } = user;
  return rest;
}
