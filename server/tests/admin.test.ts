import { describe, it, expect, afterEach } from "vitest";
import { isAdminEmail, effectivePlan, planLimits } from "../src/billing/core.js";

const ORIGINAL = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

describe("admin bypass", () => {
  it("is off when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("someone@example.com")).toBe(false);
    expect(effectivePlan("free", "someone@example.com")).toBe("free");
  });

  it("is off when ADMIN_EMAILS is empty or only separators", () => {
    process.env.ADMIN_EMAILS = "";
    expect(isAdminEmail("a@b.com")).toBe(false);
    process.env.ADMIN_EMAILS = " , , ";
    expect(isAdminEmail("a@b.com")).toBe(false);
  });

  it("never treats a null or empty email as admin", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("matches case-insensitively and ignores surrounding space", () => {
    process.env.ADMIN_EMAILS = " Owner@Example.com , second@example.com ";
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("OWNER@EXAMPLE.COM")).toBe(true);
    expect(isAdminEmail("  second@example.com  ")).toBe(true);
  });

  it("does not match a non-listed address, including a prefix of one", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail("owner@example.com.attacker.net")).toBe(false);
    expect(isAdminEmail("owner@example.co")).toBe(false);
    expect(isAdminEmail("notowner@example.com")).toBe(false);
  });

  it("resolves an admin to pro with every limit unlimited", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(effectivePlan("free", "owner@example.com")).toBe("pro");
    const limits = planLimits(effectivePlan("free", "owner@example.com"));
    expect(limits.window).toBeNull();
    expect(limits.set).toBeNull();
    expect(limits.coding).toBeNull();
    expect(limits.practice).toBeNull();
  });

  it("leaves the stored plan alone so revoking admin restores it", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(effectivePlan("plus", "owner@example.com")).toBe("pro");
    delete process.env.ADMIN_EMAILS;
    expect(effectivePlan("plus", "owner@example.com")).toBe("plus");
  });
});
