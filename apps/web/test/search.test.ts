import { describe, expect, it } from "vitest";
import { filterTasks, type SearchableTask } from "../src/search.js";

const tasks: SearchableTask[] = [
  {
    id: "G-16",
    title: "Add global task search",
    type: "feature",
    priority: "P1",
    size: "M",
    status: "In progress",
    notes: "Search and filter the board",
    section: "Web board",
  },
  {
    id: "G-17",
    title: "Write setup guide",
    type: "docs",
    priority: "P2",
    size: "S",
    status: "Backlog",
    notes: "Explain local development",
    section: "Foundations",
  },
  {
    id: "G-18",
    title: "Review the design",
    type: "feature",
    priority: "P1",
    size: "L",
    status: "Review",
    notes: "",
    section: undefined,
  },
];

describe("board task search", () => {
  it("searches task text and metadata without changing task status", () => {
    const result = filterTasks(tasks, "WEB BOARD", {});

    expect(result.map(({ id, status }) => [id, status])).toEqual([["G-16", "In progress"]]);
  });

  it("composes text search with type, priority, size and milestone filters", () => {
    const result = filterTasks(tasks, "review", {
      type: "feature",
      priority: "p1",
      size: "L",
      section: null,
    });

    expect(result.map((task) => task.id)).toEqual(["G-18"]);
  });

  it("matches task descriptions case-insensitively and filters missing attributes", () => {
    const result = filterTasks(tasks, "LOCAL DEVELOPMENT", { section: "foundations" });

    expect(result.map((task) => task.id)).toEqual(["G-17"]);
    expect(filterTasks(tasks, "", { section: null }).map((task) => task.id)).toEqual(["G-18"]);
  });
});
