import { describe, expect, it } from "vitest";
import { screenPath } from "../contracts/screen";

describe("screenPath", () => {
  it("keeps the legacy public entry for compatibility", () => {
    expect(screenPath()).toBe("/screen");
    expect(screenPath(null)).toBe("/screen");
  });

  it("carries the current district through internal screen links", () => {
    expect(screenPath("management-team")).toBe("/screen?districtId=management-team");
    expect(screenPath("partners-market-analysis")).toBe("/screen?districtId=partners-market-analysis");
  });

  it("escapes unexpected query values", () => {
    expect(screenPath("a&b=c")).toBe("/screen?districtId=a%26b%3Dc");
  });
});
