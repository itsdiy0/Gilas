import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Claude Code and Codex both start the server the way this test does: as a child process speaking
// MCP over stdio, from the bundled file the setup docs point at.

const FILE = `## M1

| ID  | Task   | Type  | Priority | Size | Status  | Notes |
| --- | ------ | ----- | -------- | ---- | ------- | ----- |
| G-1 | Set up | chore | P1       | S    | Backlog |       |
`;

let dir: string;
let tasks: string;
let client: Client;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gilas-stdio-"));
  tasks = join(dir, "demo_tasks.md");
  await writeFile(tasks, FILE, "utf8");

  const bundle = join(dir, "gilas-mcp.js");
  await build({
    entryPoints: [new URL("../src/bin.ts", import.meta.url).pathname],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    outfile: bundle,
    logLevel: "silent",
  });

  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [bundle, tasks] }),
  );
}, 30_000);

afterAll(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});

describe("bundled server over stdio", () => {
  it("lists tools, edits the file and keeps the rest byte-identical", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(6);

    const result = await client.callTool({
      name: "set_status",
      arguments: { id: "G-1", status: "Done" },
    });
    expect(result.isError).toBeFalsy();
    expect(await readFile(tasks, "utf8")).toBe(FILE.replace("Backlog", "Done   "));
  });
});
