import { describe, expect, it } from "vitest";
import tasksMd from "../../../docs/tasks.md?raw";
import {
  addTask,
  GilasError,
  parse,
  STATUSES,
  serialise,
  setStatus,
  splitLines,
  updateNotes,
  updateTask,
} from "../src/index.js";
import { fixtures } from "./fixtures.js";

const all: Record<string, string> = { ...fixtures, "docs/tasks.md": tasksMd };

/** Indexes of the lines that differ. Fails if the line count changed. */
function changedLines(before: string, after: string): number[] {
  const a = splitLines(before);
  const b = splitLines(after);
  expect(b).toHaveLength(a.length);
  return a.flatMap((line, i) =>
    line.text === b[i]?.text && line.terminator === b[i]?.terminator ? [] : [i],
  );
}

const codeOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof GilasError ? error.code : "other";
  }
  return "none";
};

describe("only the edited row changes", () => {
  for (const [name, source] of Object.entries(all)) {
    const doc = parse(source);
    const unique = doc.tasks.filter(
      (t) => doc.tasks.filter((u) => u.id.toLowerCase() === t.id.toLowerCase()).length === 1,
    );

    it(`${name}: docs/tasks.md and fixtures round-trip`, () => {
      expect(serialise(doc)).toBe(source);
    });

    for (const task of unique) {
      it(`${name}: ${task.id} status and notes edits touch line ${task.line} only`, () => {
        const target = STATUSES.find((s) => s !== task.status) as (typeof STATUSES)[number];
        expect(changedLines(source, setStatus(source, task.id, target))).toEqual([task.line - 1]);

        const hasNotes = doc.tables.some((t) => t.columns.notes !== undefined);
        if (hasNotes) {
          const after = updateNotes(source, task.id, "checked");
          expect(changedLines(source, after)).toEqual([task.line - 1]);
          expect(parse(after).tasks.find((t) => t.id === task.id)?.notes).toBe("checked");
        }
      });
    }
  }
});

describe("setStatus and updateTask", () => {
  const source = fixtures.padded as string;

  it("changes the status and keeps neighbouring cells exactly as they were", () => {
    const after = setStatus(source, "T-1", "Done");
    expect(after.split("\n")[4]).toBe(
      "| T-1 | Short     | bug     | P3       | XS   | Done        |       |",
    );
  });

  it("lets a longer value overflow its column without touching other rows", () => {
    const after = setStatus(source, "T-1", "In progress");
    expect(after.split("\n")[4]).toBe(
      "| T-1 | Short     | bug     | P3       | XS   | In progress |       |",
    );
    const long = updateTask(source, "T-1", { title: "A much longer title than before" });
    expect(changedLines(source, long)).toEqual([4]);
    expect(long.split("\n")[4]).toContain("| A much longer title than before |");
  });

  it("returns the text unchanged when the value is already set", () => {
    expect(setStatus(source, "T-1", "Review")).toBe(source);
  });

  it("matches IDs ignoring case and writes aliases in canonical form", () => {
    const after = updateTask(source, "t-2", { priority: "High" as "P1", size: "xl" as "XL" });
    const task = parse(after).tasks.find((t) => t.id === "T-2");
    expect(task).toMatchObject({ priority: "P1", size: "XL" });
    expect(after).toContain("| P1       | XL   |");
  });

  it("leaves a leniently written value alone when it already means the same", () => {
    const after = setStatus(fixtures.reordered as string, "G-2", "Done");
    expect(after).toBe(fixtures.reordered);
    expect(updateTask(fixtures.unknownValues as string, "G-2", { priority: "P1", size: "M" })).toBe(
      fixtures.unknownValues,
    );
    const other = setStatus(fixtures.reordered as string, "G-2", "Review");
    expect(other).toContain("| Review | G-2 | Two | n |");
  });

  it("escapes pipes and turns line breaks into <br>", () => {
    const after = updateNotes(source, "T-1", "a | b\nsecond line");
    expect(after).toContain("a \\| b<br>second line");
    expect(parse(after).tasks[0]?.notes).toBe("a | b<br>second line");
  });

  it("keeps CRLF and a missing final newline", () => {
    const crlf = setStatus(fixtures.crlf as string, "G-1", "Done");
    expect(crlf).toBe((fixtures.crlf as string).replace("Backlog", "Done   "));
    const bare = setStatus(fixtures.noTrailingNewline as string, "G-1", "Done");
    expect(bare.endsWith("\n")).toBe(false);
  });

  it("writes a cell beyond the end of a short row", () => {
    const after = updateNotes(fixtures.unclosedRows as string, "G-2", "hello");
    expect(parse(after).tasks.find((t) => t.id === "G-2")?.notes).toBe("hello");
  });

  it("fails without writing for bad input", () => {
    expect(codeOf(() => setStatus(source, "T-9", "Done"))).toBe("task-not-found");
    expect(codeOf(() => setStatus(fixtures.noIdAndDuplicates as string, "G-1", "Done"))).toBe(
      "duplicate-id",
    );
    expect(codeOf(() => setStatus(source, "T-1", "Blocked" as "Done"))).toBe("invalid-value");
    expect(codeOf(() => updateTask(source, "T-1", { title: "  " }))).toBe("invalid-value");
    expect(codeOf(() => updateNotes(fixtures.noOptionalColumns as string, "G-1", "x"))).toBe(
      "column-missing",
    );
  });
});

describe("updateNotes", () => {
  const source = fixtures.basic as string;

  it("appends to existing notes", () => {
    const after = updateNotes(source, "G-2", "blocked on X", { append: true });
    expect(parse(after).tasks[1]?.notes).toBe("started Monday; blocked on X");
    const empty = updateNotes(source, "G-1", "first", { append: true });
    expect(parse(empty).tasks[0]?.notes).toBe("first");
  });
});

describe("addTask", () => {
  it("appends a row to the last table, copying widths and the next ID", () => {
    const source = fixtures.padded as string;
    const { source: after, id } = addTask(source, { title: "New thing", type: "bug", size: "S" });
    expect(id).toBe("T-3");
    const lines = after.split("\n");
    expect(lines[6]).toBe("| T-3 | New thing | bug     |          | S    | Backlog     |       |");
    expect(after.startsWith(source)).toBe(true);
  });

  it("adds to the named milestone, not the last table", () => {
    const source = fixtures.basic as string;
    const { source: after, id } = addTask(source, { title: "Into M1" }, { section: "m1 · first" });
    expect(id).toBe("G-4");
    const added = parse(after).tasks.find((t) => t.id === "G-4");
    expect(added).toMatchObject({ section: "M1 · First", status: "Backlog", title: "Into M1" });
    expect(parse(after).tasks.map((t) => t.id)).toEqual(["G-1", "G-2", "G-4", "G-3"]);
  });

  it("uses the file's line ending and adds one when the file had none at the end", () => {
    const crlf = addTask(fixtures.crlf as string, { title: "x" }).source;
    expect(crlf.endsWith("\r\n")).toBe(true);
    expect(crlf.replace(/\r\n/g, "")).not.toContain("\n");

    const bare = addTask(fixtures.noTrailingNewline as string, { title: "x" }).source;
    expect(bare.split("\n")).toHaveLength(6);
    expect(bare.endsWith("\n")).toBe(false);
    expect(parse(bare).tasks.map((t) => t.id)).toEqual(["G-1", "G-2"]);
  });

  it("pads new IDs to match zero-padded ones and honours the prefix when there are none", () => {
    const padded = `${fixtures.noOptionalColumns as string}`.replace("G-1", "T-009");
    expect(addTask(padded, { title: "x" }).id).toBe("T-010");
    expect(
      addTask("| ID | Task | Status |\n| -- | -- | -- |\n", { title: "x" }, { prefix: "Z" }).id,
    ).toBe("Z-1");
  });

  it("fails clearly when there is nowhere to add", () => {
    expect(codeOf(() => addTask(fixtures.prose as string, { title: "x" }))).toBe("no-table");
    expect(
      codeOf(() => addTask(fixtures.basic as string, { title: "x" }, { section: "Nope" })),
    ).toBe("section-not-found");
    expect(
      codeOf(() => addTask(fixtures.noOptionalColumns as string, { title: "x", size: "S" })),
    ).toBe("column-missing");
  });
});
