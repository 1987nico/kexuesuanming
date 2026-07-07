import { describe, expect, it } from "vitest";
import { hashPassword, normalizeAccount, verifyPassword } from "./password";

describe("mianba password helpers", () => {
  it("normalizes accounts for login lookup", () => {
    expect(normalizeAccount(" Admin ")).toBe("admin");
  });

  it("hashes and verifies passwords", () => {
    const encoded = hashPassword("operator-secret");
    expect(encoded).not.toContain("operator-secret");
    expect(verifyPassword("operator-secret", encoded)).toBe(true);
    expect(verifyPassword("wrong-secret", encoded)).toBe(false);
  });

  it("rejects malformed password hashes", () => {
    expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });
});
