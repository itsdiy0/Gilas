import { readFile, writeFile } from "node:fs/promises";
import type { Task } from "@gilas/core";
import {
  addTask,
  findTasks,
  GilasError,
  nextTask,
  PRIORITIES,
  parse,
  parsePriority,
  SIZES,
  STATUSES,
  setStatus,
  updateNotes,
} from "@gilas/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export interface ServerOptions {
  /** Path of the `*_tasks.md` file the tools read and write. */
  file: string;
  version?: string;
}

const status = z.enum(STATUSES);
// Priority and size accept the aliases the format allows (e.g. "high"); the core normalises them.
const priority = z
  .string()
  .describe(`One of ${PRIORITIES.join(", ")} (High, Med and Low also work).`);
const size = z.string().describe(`One of ${SIZES.join(", ")}.`);

const json = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const fail = (error: unknown): CallToolResult => ({
  isError: true,
  content: [
    {
      type: "text",
      text: error instanceof GilasError ? error.message : `Unexpected error: ${String(error)}`,
    },
  ],
});

/** Tool results leave out `line`, which only matters to editors. */
const present = ({ line: _line, ...task }: Task) => task;

export function createServer({ file, version = "0.0.0" }: ServerOptions): McpServer {
  const server = new McpServer({ name: "gilas", version });

  const load = async () => {
    const source = await readFile(file, "utf8");
    return { source, doc: parse(source) };
  };
  // Re-read inside every write so an edit made by a person a moment ago is never overwritten.
  const save = async (change: (source: string) => string) => {
    const { source } = await load();
    const updated = change(source);
    if (updated !== source) await writeFile(file, updated, "utf8");
  };

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks, optionally filtered by status, milestone or priority.",
      inputSchema: {
        status: status.optional(),
        section: z.string().optional().describe("Milestone name (the `##` heading)."),
        priority: priority.optional(),
      },
    },
    async (args) => {
      try {
        const { doc } = await load();
        const wanted = args.priority === undefined ? undefined : parsePriority(args.priority);
        if (args.priority !== undefined && wanted === undefined) {
          throw new GilasError("invalid-value", `Invalid priority: "${args.priority}".`);
        }
        const tasks = doc.tasks
          .filter((t) => args.status === undefined || t.status === args.status)
          .filter(
            (t) =>
              args.section === undefined ||
              t.section?.toLowerCase() === args.section.trim().toLowerCase(),
          )
          .filter((t) => wanted === undefined || t.priority === wanted);
        return json({ tasks: tasks.map(present), warnings: doc.warnings });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "get_task",
    {
      description: "Get one task by ID, for example G-12.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        const { doc } = await load();
        const [task] = findTasks(doc, id);
        if (task === undefined) throw new GilasError("task-not-found", `No task with ID ${id}.`);
        return json(present(task));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "set_status",
    {
      description: "Move a task to a new status. Only that task's row changes.",
      inputSchema: { id: z.string(), status },
    },
    async ({ id, status: to }) => {
      try {
        await save((source) => setStatus(source, id, to));
        return json(present(await taskAfter(id)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "add_task",
    {
      description:
        "Add a task at the end of a milestone (default: the last table). Returns the new ID.",
      inputSchema: {
        title: z.string(),
        type: z.string().optional(),
        priority: priority.optional(),
        size: size.optional(),
        status: status.optional().describe("Defaults to Backlog."),
        notes: z.string().optional(),
        section: z.string().optional().describe("Milestone name (the `##` heading)."),
      },
    },
    async ({ section, ...fields }) => {
      try {
        const { source } = await load();
        const task = withoutUndefined(fields) as Parameters<typeof addTask>[1];
        const added = addTask(source, task, section === undefined ? {} : { section });
        await writeFile(file, added.source, "utf8");
        return json(present(await taskAfter(added.id)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "update_notes",
    {
      description: "Replace a task's notes, or add to them with append.",
      inputSchema: {
        id: z.string(),
        notes: z.string(),
        append: z
          .boolean()
          .optional()
          .describe("Add to the existing notes instead of replacing them."),
      },
    },
    async ({ id, notes, append }) => {
      try {
        await save((source) => updateNotes(source, id, notes, { append: append === true }));
        return json(present(await taskAfter(id)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "next_task",
    {
      description:
        "The best task to work on: Next up before Backlog, then highest priority, then file order.",
      inputSchema: { section: z.string().optional().describe("Limit to one milestone.") },
    },
    async ({ section }) => {
      try {
        const { doc } = await load();
        const task = nextTask(doc, section === undefined ? {} : { section });
        return json(task === undefined ? { task: null } : { task: present(task) });
      } catch (error) {
        return fail(error);
      }
    },
  );

  async function taskAfter(id: string): Promise<Task> {
    const { doc } = await load();
    const [task] = findTasks(doc, id);
    if (task === undefined) throw new GilasError("task-not-found", `No task with ID ${id}.`);
    return task;
  }

  return server;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
