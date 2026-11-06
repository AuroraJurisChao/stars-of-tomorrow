import { describe, expect, it } from "vitest";
import { buildCredentialPlan, isDefaultDemoRoster, randomInitialPassword } from "./provision";

describe("public provisioning credentials", () => {
  it("uses explicit demo credentials only for the fictional roster", () => {
    expect(isDefaultDemoRoster()).toBe(true);
    const plan = buildCredentialPlan(true);
    expect(plan).toHaveLength(7);
    expect(plan.filter(account => account.role === "member").every(account => account.password === "Demo1234")).toBe(true);
    expect(plan.find(account => account.role === "organizer")?.password).toBe("Organizer1234");
  });

  it("generates independent passwords that meet the login rules", () => {
    const plan = buildCredentialPlan(false);
    expect(new Set(plan.map(account => account.password)).size).toBe(plan.length);
    for (const account of plan) {
      expect(account.password).toHaveLength(10);
      expect(account.password).toMatch(/[A-Za-z]/);
      expect(account.password).toMatch(/\d/);
    }
    expect(randomInitialPassword()).not.toBe(randomInitialPassword());
  });
});
