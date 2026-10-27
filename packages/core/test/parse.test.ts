import { describe, expect, it } from "vitest";
import { parse, serialise } from "../src/index.js";
import { fixtures } from "./fixtures.js";

const tasksOf = (name: string) => parse(fixtures[name] as string).tasks;

describe("parse", () => {
  it("reads every field of a task", () => {
    const [first, second] = tasksOf("basic");
    expect(first).toEqual({
      id: "G-1",
      title: "Set up",
      type: "chore",
      priority: "P1",
      size: "S",
      status: "Done",
      notes: "",
      section: "M1 · First",
      line: 7,
    });
    expect(second).toMatchObject({ id: "G-2", priority: "P0", size: "L", notes: "started Monday" });
  });

  it("groups tasks by ## milestone", () => {
    const doc = parse(fixtures.basic as string);
    expect(doc.sections.map((s) => s.name)).toEqual(["M1 · First", "M2 · Second"]);
    expect(doc.tasks.map((t) => t.section)).toEqual(["M1 · First", "M1 · First", "M2 · Second"]);
  });

  it("finds no tasks in empty or prose-only files", () => {
    expect(parse("").tasks).toEqual([]);
    expect(parse(fixtures.prose as string).tasks).toEqual([]);
  });

  it("reads CRLF, mixed endings and a byte order mark", () => {
    expect(parse(fixtures.crlf as string).eol).toBe("\r\n");
    expect(tasksOf("crlf").map((t) => t.id)).toEqual(["G-1", "G-2"]);
    expect(tasksOf("mixedEndings").map((t) => t.id)).toEqual(["G-1", "G-2"]);
    expect(tasksOf("bom")[0]?.section).toBe("A");
  });

  it("reads the last row when the file has no final newline", () => {
    expect(tasksOf("noTrailingNewline").map((t) => t.id)).toEqual(["G-1"]);
  });

  it("reads indented tables, tables without outer pipes and unclosed rows", () => {
    expect(tasksOf("tabsAndIndent")).toHaveLength(2);
    expect(tasksOf("noOuterPipes")).toHaveLength(0);
    const unclosed = tasksOf("unclosedRows");
    expect(unclosed.map((t) => [t.id, t.status])).toEqual([
      ["G-1", "Backlog"],
      ["G-2", undefined],
    ]);
  });

  it("unescapes pipes and keeps pipes inside code spans", () => {
    const [task] = tasksOf("escapedPipes");
    expect(task?.title).toBe("Use a | b");
    expect(task?.notes).toBe("run `a | b` first | then more");
    expect(task?.status).toBe("Backlog");
  });

  it("handles reordered, missing and extra columns", () => {
    expect(tasksOf("reordered").map((t) => [t.id, t.status, t.notes])).toEqual([
      ["G-1", "Backlog", ""],
      ["G-2", "Done", "n"],
    ]);
    expect(tasksOf("noOptionalColumns")[0]).toMatchObject({ type: "", priority: undefined });
    expect(tasksOf("extraColumns")[0]).toMatchObject({ id: "G-1", status: "Backlog" });
  });

  it("matches values leniently and warns about unknown ones", () => {
    const doc = parse(fixtures.unknownValues as string);
    expect(doc.tasks.map((t) => [t.status, t.priority, t.size])).toEqual([
      [undefined, undefined, undefined],
      ["In progress", "P1", "M"],
    ]);
    expect(doc.warnings.map((w) => w.code)).toEqual([
      "unknown-status",
      "unknown-priority",
      "unknown-size",
    ]);
  });

  it("warns about rows with no ID and duplicate IDs", () => {
    const doc = parse(fixtures.noIdAndDuplicates as string);
    expect(doc.tasks.map((t) => t.id)).toEqual(["G-1", "g-1"]);
    expect(doc.warnings.map((w) => [w.code, w.line])).toEqual([
      ["missing-id", 5],
      ["duplicate-id", 7],
    ]);
  });

  it("assigns milestones across several tables, ignoring ### and ending at #", () => {
    expect(tasksOf("multipleTables").map((t) => [t.id, t.section])).toEqual([
      ["G-1", undefined],
      ["G-2", "A"],
      ["G-3", "A"],
      ["G-4", undefined],
    ]);
  });

  it("ignores tables inside code fences and comments", () => {
    expect(tasksOf("fencesAndComments").map((t) => t.id)).toEqual(["G-1"]);
  });
});

describe("round trip", () => {
  for (const [name, source] of Object.entries(fixtures)) {
    it(`gives back the identical text for ${name}`, () => {
      expect(serialise(parse(source))).toBe(source);
    });
  }
});
