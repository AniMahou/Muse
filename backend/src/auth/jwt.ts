import jwt from "jsonwebtoken";
import { JwtPayloadSchema, type JwtPayload } from "@shared/auth.schema";
import { config } from "@/common/config";
import { AppError } from "@/common/errors";

const ISSUER = "muse";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    issuer: ISSUER,
  } as jwt.SignOptions);
}

/**
 * Verify and parse.
 *
 * The decoded claims are run through Zod rather than trusted as-is. A valid
 * signature only proves WE issued the token, not that its shape still matches
 * what the code expects — tokens outlive deploys, and a payload that changed
 * shape between releases would otherwise flow into route handlers as
 * undefined.
 */
export function verifyToken(token: string): JwtPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { issuer: ISSUER });
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw new AppError(
      expired ? "session expired" : "invalid token",
      401,
      expired ? "token_expired" : "unauthenticated",
    );
  }

  const parsed = JwtPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new AppError("malformed token", 401, "unauthenticated");
  return parsed.data;
}
