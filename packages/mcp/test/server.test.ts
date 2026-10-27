import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

const FILE = `# Demo

Hand-written intro.

## M1 · First

| ID  | Task      | Type    | Priority | Size | Status      | Notes          |
| --- | --------- | ------- | -------- | ---- | ----------- | -------------- |
| G-1 | Set up    | chore   | P1       | S    | Done        |                |
| G-2 | Build it  | feature | P0       | L    | In progress | started Monday |
| G-3 | Write up  | docs    | high     | M    | Next up     |                |

## M2 · Second

| ID  | Task      | Type    | Priority | Size | Status  | Notes |
| --- | --------- | ------- | -------- | ---- | ------- | ----- |
| G-4 | Ship      | feature | P2       | M    | Backlog |       |
`;

let dir: string;
let file: string;
let client: Client;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gilas-mcp-"));
  file = join(dir, "demo_tasks.md");
  await writeFile(file, FILE, "utf8");

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ file }).connect(serverSide);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  const text = first?.text ?? "";
  return {
    isError: result.isError === true,
    text,
    data: result.isError ? undefined : JSON.parse(text),
  };
}

describe("tools", () => {
  it("lists the six tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_task",
      "get_task",
      "list_tasks",
      "next_task",
      "set_status",
      "update_notes",
    ]);
  });

  it("list_tasks returns every task, and filters by status, milestone and priority", async () => {
    expect((await call("list_tasks")).data.tasks).toHaveLength(4);
    const byStatus = await call("list_tasks", { status: "Done" });
    expect(byStatus.data.tasks.map((t: { id: string }) => t.id)).toEqual(["G-1"]);
    const bySection = await call("list_tasks", { section: "m2 · second" });
    expect(bySection.data.tasks.map((t: { id: string }) => t.id)).toEqual(["G-4"]);
    const byPriority = await call("list_tasks", { priority: "High" });
    expect(byPriority.data.tasks.map((t: { id: string }) => t.id)).toEqual(["G-1", "G-3"]);
  });

  it("list_tasks rejects a priority it does not know", async () => {
    const result = await call("list_tasks", { priority: "urgent" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Invalid priority");
  });

  it("get_task returns one task, ignoring case, and errors for an unknown ID", async () => {
    const found = await call("get_task", { id: "g-2" });
    expect(found.data).toMatchObject({ id: "G-2", title: "Build it", status: "In progress" });
    const missing = await call("get_task", { id: "G-99" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toBe("No task with ID G-99.");
  });

  it("set_status changes only that row", async () => {
    const result = await call("set_status", { id: "G-4", status: "Review" });
    expect(result.data.status).toBe("Review");
    expect(await readFile(file, "utf8")).toBe(FILE.replace("| Backlog |", "| Review  |"));
  });

  it("set_status rejects a status that does not exist and leaves the file alone", async () => {
    const result = await client.callTool({
      name: "set_status",
      arguments: { id: "G-4", status: "Blocked" },
    });
    expect(result.isError).toBe(true);
    expect(await readFile(file, "utf8")).toBe(FILE);
  });

  it("add_task appends to the chosen milestone with the next ID", async () => {
    const result = await call("add_task", {
      title: "Docs pass",
      type: "docs",
      priority: "low",
      section: "M1 · First",
    });
    expect(result.data).toMatchObject({
      id: "G-5",
      title: "Docs pass",
      priority: "P3",
      status: "Backlog",
    });
    const lines = (await readFile(file, "utf8")).split("\n");
    const at = lines.findIndex((l) => l.includes("G-5"));
    expect(lines[at - 1]).toContain("G-3");
  });

  it("add_task defaults to the last table and reports unknown milestones", async () => {
    expect((await call("add_task", { title: "Last one" })).data.section).toBe("M2 · Second");
    const bad = await call("add_task", { title: "Nowhere", section: "M9" });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('No milestone called "M9"');
  });

  it("update_notes replaces, or appends when asked", async () => {
    expect((await call("update_notes", { id: "G-2", notes: "done soon" })).data.notes).toBe(
      "done soon",
    );
    const appended = await call("update_notes", {
      id: "G-2",
      notes: "blocked on G-1",
      append: true,
    });
    expect(appended.data.notes).toBe("done soon; blocked on G-1");
  });

  it("next_task picks Next up first, or null when nothing is waiting", async () => {
    expect((await call("next_task")).data.task.id).toBe("G-3");
    expect((await call("next_task", { section: "M2 · Second" })).data.task.id).toBe("G-4");
    await call("set_status", { id: "G-3", status: "Done" });
    await call("set_status", { id: "G-4", status: "Done" });
    expect((await call("next_task")).data).toEqual({ task: null });
  });

  it("sees edits made to the file between calls", async () => {
    await writeFile(file, FILE.replace("Ship", "Ship it"), "utf8");
    expect((await call("get_task", { id: "G-4" })).data.title).toBe("Ship it");
  });

  it("reports a missing file as an error", async () => {
    await rm(file);
    const result = await call("list_tasks");
    expect(result.isError).toBe(true);
  });
});
