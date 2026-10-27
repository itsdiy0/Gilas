import { describe, expect, it } from "vitest";
import { nextId, nextTask, parse } from "../src/index.js";

const doc = (rows: string[]) =>
  parse(`## A\n\n| ID | Task | Priority | Status |\n| -- | -- | -- | -- |\n${rows.join("\n")}\n`);

describe("nextTask", () => {
  it("prefers Next up over Backlog, then priority, then file order", () => {
    const d = doc([
      "| G-1 | a | P0 | In progress |",
      "| G-2 | b | P0 | Backlog |",
      "| G-3 | c | P2 | Next up |",
      "| G-4 | d | P1 | Next up |",
      "| G-5 | e | P1 | Next up |",
    ]);
    expect(nextTask(d)?.id).toBe("G-4");
  });

  it("falls back to Backlog and ranks tasks with no priority last", () => {
    const d = doc([
      "| G-1 | a |  | Backlog |",
      "| G-2 | b | P3 | Backlog |",
      "| G-3 | c | P0 | Done |",
    ]);
    expect(nextTask(d)?.id).toBe("G-2");
  });

  it("returns nothing when there is nothing to pick, and can filter by milestone", () => {
    expect(nextTask(doc(["| G-1 | a | P1 | Done |"]))).toBeUndefined();
    expect(nextTask(doc(["| G-1 | a | P1 | Backlog |"]), { section: "B" })).toBeUndefined();
  });
});

describe("nextId", () => {
  it("uses the most common prefix and the highest number plus one", () => {
    expect(
      nextId(
        doc(["| G-2 | a | P1 | Done |", "| G-10 | b | P1 | Done |", "| X-99 | c | P1 | Done |"]),
      ),
    ).toBe("G-11");
  });

  it("starts from 1 and never reuses an ID, even after a gap", () => {
    expect(nextId(doc([]))).toBe("T-1");
    expect(nextId(doc(["| G-7 | a | P1 | Done |"]))).toBe("G-8");
  });
});
