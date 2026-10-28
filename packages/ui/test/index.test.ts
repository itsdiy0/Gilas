import { describe, expect, it } from "vitest";
import { labelToneIndex, priorityClassName } from "../src/index.js";

describe("shared board component styling", () => {
  it("maps supported priorities to their card colour classes", () => {
    expect(["P0", "P1", "P2", "P3"].map(priorityClassName)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(priorityClassName("P4")).toBe("none");
    expect(priorityClassName(undefined)).toBe("none");
  });

  it("keeps a label on a stable colour across renders", () => {
    expect(labelToneIndex("feature")).toBe(labelToneIndex("feature"));
    expect(labelToneIndex("feature")).toBeGreaterThanOrEqual(0);
    expect(labelToneIndex("feature")).toBeLessThan(6);
  });
});
