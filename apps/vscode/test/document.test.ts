import { describe, expect, it } from "vitest";
import { parse, splitLines } from "../../../packages/core/src/index.js";
import { readTaskBoard, updateTaskBoardStatus } from "../src/document.js";

const source = [
  "# Roadmap",
  "",
  "## M1",
  "| ID | Task | Status | Notes |",
  "| --- | --- | --- | --- |",
  "| G-1 | First task  | Backlog | keep this note |",
  "| G-2 | Second task | Review  | leave alone    |",
  "",
].join("\n");

describe("VS Code task document", () => {
  it("reads tasks and parser warnings from the Markdown source", () => {
    expect(readTaskBoard(source)).toMatchObject({
      tasks: [
        { id: "G-1", title: "First task", status: "Backlog", section: "M1" },
        { id: "G-2", title: "Second task", status: "Review", section: "M1" },
      ],
      warnings: [],
    });
  });

  it("changes only the selected row through the core writer", () => {
    const updated = updateTaskBoardStatus(source, "G-1", "Done");
    const beforeLines = splitLines(source);
    const afterLines = splitLines(updated);
    const changed = beforeLines.flatMap((line, index) =>
      line.text === afterLines[index]?.text && line.terminator === afterLines[index]?.terminator
        ? []
        : [index],
    );

    expect(changed).toEqual([5]);
    expect(parse(updated).tasks.find((task) => task.id === "G-1")?.status).toBe("Done");
    expect(parse(updated).tasks.find((task) => task.id === "G-2")?.status).toBe("Review");
  });

  it("rejects unrecognised statuses", () => {
    expect(() => updateTaskBoardStatus(source, "G-1", "Blocked")).toThrow(
      "That task status is not recognised.",
    );
  });
});
