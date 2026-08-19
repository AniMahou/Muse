import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { signToken, verifyToken } from "./jwt";
import { homeFor } from "@shared/auth.schema";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret124", hash)).toBe(false);
  });

  it("produces a different hash each time", async () => {
    // Random salt per hash: two users with the same password must not share a
    // stored value, or one cracked hash cracks both.
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("stores salt and key together", async () => {
    const [salt, key] = (await hashPassword("x")).split(":");
    expect(salt).toHaveLength(32);
    expect(key).toHaveLength(128);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });

  it("handles unicode passwords", async () => {
    const hash = await hashPassword("পাসওয়ার্ড১২৩");
    expect(await verifyPassword("পাসওয়ার্ড১২৩", hash)).toBe(true);
    expect(await verifyPassword("পাসওয়ার্ড১২৪", hash)).toBe(false);
  });
});

describe("jwt", () => {
  const payload = {
    sub: "usr_1", companyId: "co_1", role: "rep" as const,
    repId: "rep_1", email: "a@b.com", name: "Rahim",
  };

  it("round-trips a payload", () => {
    const claims = verifyToken(signToken(payload));
    expect(claims).toMatchObject(payload);
  });

  it("rejects a tampered token", () => {
    const token = signToken(payload);
    const tampered = token.slice(0, -4) + "AAAA";
    expect(() => verifyToken(tampered)).toThrow(/invalid token/i);
  });

  it("rejects nonsense", () => {
    expect(() => verifyToken("not.a.token")).toThrow();
    expect(() => verifyToken("")).toThrow();
  });

  it("rejects a token signed with another secret", () => {
    // Hand-built with a different key — must not validate.
    const foreign =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiJ1c3JfMSIsImNvbXBhbnlJZCI6ImNvXzEiLCJyb2xlIjoib3duZXIifQ." +
      "ZmFrZXNpZ25hdHVyZQ";
    expect(() => verifyToken(foreign)).toThrow();
  });

  it("carries the role, which is what routes on", () => {
    expect(verifyToken(signToken({ ...payload, role: "owner", repId: null })).role).toBe("owner");
  });
});

describe("homeFor", () => {
  it("sends reps to the field app", () => expect(homeFor("rep")).toBe("/app"));
  it("sends owners and admins to the console", () => {
    expect(homeFor("owner")).toBe("/console");
    expect(homeFor("admin")).toBe("/console");
  });
});
