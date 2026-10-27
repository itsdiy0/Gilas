import { describe, expect, it } from "vitest";
import { STATUSES } from "../src/index.js";

describe("core", () => {
  it("lists the six statuses in workflow order", () => {
    expect(STATUSES).toEqual(["Backlog", "Next up", "In progress", "Review", "Done", "Parked"]);
  });
});
