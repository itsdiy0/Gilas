import { parse } from "./parse.js";
import { findTasks, nextId } from "./query.js";
import type { RowParts } from "./row.js";
import { decodeCell, encodeCell, joinRow, splitRow, withCell } from "./row.js";
import type { Columns, Priority, Size, Status, Task, TaskDocument, TaskTable } from "./types.js";
import { GilasError } from "./types.js";
import { parsePriority, parseSize, parseStatus } from "./values.js";

export interface TaskPatch {
  title?: string;
  type?: string;
  priority?: Priority;
  size?: Size;
  status?: Status;
  notes?: string;
}

export interface NewTask extends TaskPatch {
  title: string;
}

export interface AddOptions {
  /** Milestone to add to (a `##` heading, ignoring case). Defaults to the last task table. */
  section?: string;
  /** ID prefix, used only if the file has no IDs to copy. */
  prefix?: string;
}

const COLUMN_OF: Record<keyof TaskPatch, keyof Columns> = {
  title: "title",
  type: "type",
  priority: "priority",
  size: "size",
  status: "status",
  notes: "notes",
};

/** Checks a patch and turns aliases into canonical values, e.g. "high" into "P1". */
function cellsFor(patch: TaskPatch): [keyof TaskPatch, string][] {
  const cells: [keyof TaskPatch, string][] = [];
  const canonical = <T extends string>(
    field: keyof TaskPatch,
    value: string,
    parse: (text: string) => T | undefined,
  ) => {
    const result = parse(value);
    if (result === undefined)
      throw new GilasError("invalid-value", `Invalid ${field}: "${value}".`);
    cells.push([field, result]);
  };
  if (patch.title !== undefined) {
    if (patch.title.trim() === "") throw new GilasError("invalid-value", "Title cannot be empty.");
    cells.push(["title", patch.title]);
  }
  if (patch.type !== undefined) cells.push(["type", patch.type]);
  if (patch.priority !== undefined) canonical("priority", patch.priority, parsePriority);
  if (patch.size !== undefined) canonical("size", patch.size, parseSize);
  if (patch.status !== undefined) canonical("status", patch.status, parseStatus);
  if (patch.notes !== undefined) cells.push(["notes", patch.notes]);
  return cells;
}

function columnFor(table: TaskTable, field: keyof TaskPatch): number {
  const column = table.columns[COLUMN_OF[field]];
  if (column === undefined) {
    throw new GilasError("column-missing", `This table has no ${field} column.`);
  }
  return column;
}

/** True when the cell already holds the value, e.g. `high` when setting P1. */
function alreadyMeans(field: keyof TaskPatch, seg: string, value: string): boolean {
  const text = decodeCell(seg);
  if (field === "status") return parseStatus(text) === value;
  if (field === "priority") return parsePriority(text) === value;
  if (field === "size") return parseSize(text) === value;
  return seg.trim() === encodeCell(value);
}

function applyCells(row: RowParts, table: TaskTable, cells: [keyof TaskPatch, string][]): RowParts {
  let result = row;
  for (const [field, value] of cells) {
    const column = columnFor(table, field);
    const current = result.segs[column];
    if (current !== undefined && alreadyMeans(field, current, value)) continue;
    result = withCell(result, column, value);
  }
  return result;
}

function locate(doc: TaskDocument, id: string): { task: Task; table: TaskTable } {
  const matches = findTasks(doc, id);
  const task = matches[0];
  if (task === undefined) throw new GilasError("task-not-found", `No task with ID ${id}.`);
  if (matches.length > 1) {
    throw new GilasError("duplicate-id", `ID ${id} is used more than once; fix the file first.`);
  }
  const table = doc.tables.find((t) => task.line - 1 >= t.firstRow && task.line - 1 < t.endRow);
  if (table === undefined) throw new GilasError("task-not-found", `No table holds ${id}.`);
  return { task, table };
}

const build = (doc: TaskDocument, replace: Map<number, string>): string =>
  doc.lines.map((line, i) => (replace.get(i) ?? line.text) + line.terminator).join("");

/** Rewrites only the cells that change in the task's row. Returns the new file text. */
export function updateTask(source: string, id: string, patch: TaskPatch): string {
  const doc = parse(source);
  const cells = cellsFor(patch);
  const { task, table } = locate(doc, id);
  const row = splitRow((doc.lines[task.line - 1] as { text: string }).text) as RowParts;
  const updated = applyCells(row, table, cells);
  return build(doc, new Map([[task.line - 1, joinRow(updated)]]));
}

export const setStatus = (source: string, id: string, status: Status): string =>
  updateTask(source, id, { status });

/** Replaces the notes, or adds to them when `append` is set. */
export function updateNotes(
  source: string,
  id: string,
  text: string,
  options: { append?: boolean; separator?: string } = {},
): string {
  if (!options.append) return updateTask(source, id, { notes: text });
  const { task } = locate(parse(source), id);
  const joined = task.notes === "" ? text : `${task.notes}${options.separator ?? "; "}${text}`;
  return updateTask(source, id, { notes: joined });
}

/** Adds a row at the end of a table. Returns the new text and the new task's ID. */
export function addTask(
  source: string,
  task: NewTask,
  options: AddOptions = {},
): { source: string; id: string } {
  const doc = parse(source);
  const cells = cellsFor({ status: "Backlog", ...task });

  let candidates = doc.tables;
  if (options.section !== undefined) {
    const wanted = options.section.trim().toLowerCase();
    if (!doc.sections.some((s) => s.name.toLowerCase() === wanted)) {
      throw new GilasError("section-not-found", `No milestone called "${options.section}".`);
    }
    candidates = doc.tables.filter((t) => t.section?.toLowerCase() === wanted);
  }
  const table = candidates[candidates.length - 1];
  if (table === undefined) throw new GilasError("no-table", "No task table to add the task to.");

  const id = nextId(doc, options.prefix);
  const header = splitRow((doc.lines[table.headerIndex] as { text: string }).text) as RowParts;
  const blank: RowParts = {
    indent: header.indent,
    segs: header.segs.map((seg) => " ".repeat(seg.length)),
    closed: header.closed,
    tail: "",
  };
  const row = withCell(applyCells(blank, table, cells), table.columns.id, id);

  const lastIndex = table.endRow - 1;
  const last = doc.lines[lastIndex] as { text: string; terminator: string };
  const lines = doc.lines.map((line) => ({ ...line }));
  const terminator = last.terminator || doc.eol;
  (lines[lastIndex] as { terminator: string }).terminator = terminator;
  lines.splice(table.endRow, 0, {
    text: joinRow(row),
    terminator: last.terminator === "" ? "" : terminator,
  });
  return { source: lines.map((line) => line.text + line.terminator).join(""), id };
}
