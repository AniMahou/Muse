import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);

/**
 * scrypt rather than bcrypt.
 *
 * It ships in Node's standard library, so there is no native module to build
 * and nothing to keep patched — and it is memory-hard, which is the property
 * that actually matters against GPU cracking. bcrypt would mean a dependency
 * with a compile step for no security gain.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const key = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

/**
 * Constant-time comparison. A plain `===` leaks how much of the hash matched
 * through timing, which is a real if fiddly attack.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(plain, salt, KEY_LENGTH)) as Buffer;
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
