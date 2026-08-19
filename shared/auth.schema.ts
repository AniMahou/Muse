import { z } from "zod";

/**
 * Accounts and sessions.
 *
 * The signup flow models how this is actually bought. A COMPANY onboards, and
 * the person who signs up becomes its owner. Field representatives are then
 * INVITED by that owner — they never self-register, because no FMCG company
 * will let anyone claiming to be a rep create an account and pull down their
 * SKU master, outlet list and territory coverage.
 *
 * Both roles authenticate through the same form; the role inside the token
 * decides which application they land in.
 */

export const RoleSchema = z.enum([
  /** Signed up, owns the company, sees the admin console. */
  "owner",
  /** Invited by an owner. Same console, cannot manage billing or other admins. */
  "admin",
  /** Invited by an owner. Sees the field app only. */
  "rep",
]);
export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = z.object({
  userId: z.string().min(1),
  companyId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: RoleSchema,
  /** scrypt hash, stored as `salt:derivedKey`. Never leaves the server. */
  passwordHash: z.string().min(1),
  /** Set for reps: links the account to its Rep record and brand portfolio. */
  repId: z.string().nullable().default(null),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  lastLoginAt: z.string().datetime().nullable().default(null),
});
export type User = z.infer<typeof UserSchema>;

/** What the client is allowed to see about itself. */
export const PublicUserSchema = UserSchema.omit({ passwordHash: true });
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string(),
  companyId: z.string(),
  role: RoleSchema,
  repId: z.string().nullable(),
  email: z.string(),
  name: z.string(),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const RegisterRequestSchema = z.object({
  companyName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const InviteRequestSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "rep"]),
  territoryId: z.string().nullable().optional(),
  brandPortfolio: z.array(z.string()).optional(),
});
export type InviteRequest = z.infer<typeof InviteRequestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: PublicUserSchema,
  company: z.object({ companyId: z.string(), name: z.string() }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** Where the client should go after authenticating. */
export function homeFor(role: Role): "/console" | "/app" {
  return role === "rep" ? "/app" : "/console";
}
