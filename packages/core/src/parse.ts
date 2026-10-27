import type { RowParts } from "./row.js";
import { decodeCell, isSeparatorRow, splitRow } from "./row.js";
import type {
  Columns,
  Line,
  ParseWarning,
  Section,
  Task,
  TaskDocument,
  TaskTable,
} from "./types.js";
import { parsePriority, parseSize, parseStatus } from "./values.js";

const HEADING = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== "\n") continue;
    const crlf = i > start && source[i - 1] === "\r";
    lines.push({ text: source.slice(start, crlf ? i - 1 : i), terminator: crlf ? "\r\n" : "\n" });
    start = i + 1;
  }
  if (start < source.length) lines.push({ text: source.slice(start), terminator: "" });
  return lines;
}

export const serialise = (doc: TaskDocument): string =>
  doc.lines.map((line) => line.text + line.terminator).join("");

function readColumns(header: RowParts): Columns | undefined {
  const names = header.segs.map((seg) => decodeCell(seg).toLowerCase());
  const find = (...options: string[]) => {
    const index = names.findIndex((name) => options.includes(name));
    return index === -1 ? undefined : index;
  };
  const id = find("id");
  const title = find("task", "title");
  const status = find("status");
  if (id === undefined || title === undefined || status === undefined) return undefined;
  return {
    id,
    title,
    status,
    type: find("type"),
    priority: find("priority"),
    size: find("size"),
    notes: find("notes", "note"),
  };
}

export function parse(source: string): TaskDocument {
  const lines = splitLines(source);
  const eol = lines.find((line) => line.terminator !== "")?.terminator ?? "\n";
  const tables: TaskTable[] = [];
  const tasks: Task[] = [];
  const sections: Section[] = [];
  const warnings: ParseWarning[] = [];
  const seen = new Set<string>();

  let section: string | undefined;
  let fence: string | undefined;
  let inComment = false;

  const rowAt = (index: number) => {
    const line = lines[index];
    return line === undefined ? undefined : splitRow(line.text);
  };

  let i = 0;
  while (i < lines.length) {
    const text = (lines[i] as Line).text;
    const trimmed = text.trim();

    if (inComment) {
      if (trimmed.includes("-->")) inComment = false;
      i++;
      continue;
    }
    const fenceMark = FENCE.exec(text)?.[1];
    if (fenceMark !== undefined) {
      if (fence === undefined) fence = fenceMark;
      else if (fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = undefined;
      i++;
      continue;
    }
    if (fence !== undefined) {
      i++;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      inComment = !trimmed.includes("-->");
      i++;
      continue;
    }

    const heading = HEADING.exec(text.trimStart());
    if (heading !== null) {
      const level = (heading[1] as string).length;
      if (level === 1) section = undefined;
      if (level === 2) {
        section = heading[2] as string;
        sections.push({ name: section, line: i + 1 });
      }
      i++;
      continue;
    }

    const header = rowAt(i);
    const separator = rowAt(i + 1);
    if (header === undefined || separator === undefined || !isSeparatorRow(separator)) {
      i++;
      continue;
    }

    let end = i + 2;
    while (rowAt(end) !== undefined) end++;

    const columns = readColumns(header);
    if (columns !== undefined) {
      tables.push({ section, headerIndex: i, firstRow: i + 2, endRow: end, columns });
      for (let row = i + 2; row < end; row++) {
        const segs = (rowAt(row) as RowParts).segs;
        const cell = (column: number | undefined) =>
          column === undefined ? "" : decodeCell(segs[column] ?? "");
        const line = row + 1;

        const id = cell(columns.id);
        if (id === "") {
          warnings.push({ line, code: "missing-id", message: "Row has no ID and was skipped." });
          continue;
        }
        if (seen.has(id.toLowerCase())) {
          warnings.push({
            line,
            code: "duplicate-id",
            message: `ID ${id} is used more than once.`,
          });
        }
        seen.add(id.toLowerCase());

        const statusText = cell(columns.status);
        const priorityText = cell(columns.priority);
        const sizeText = cell(columns.size);
        const status = parseStatus(statusText);
        const priority = parsePriority(priorityText);
        const size = parseSize(sizeText);
        if (statusText !== "" && status === undefined) {
          warnings.push({
            line,
            code: "unknown-status",
            message: `Unknown status "${statusText}".`,
          });
        }
        if (priorityText !== "" && priority === undefined) {
          warnings.push({
            line,
            code: "unknown-priority",
            message: `Unknown priority "${priorityText}".`,
          });
        }
        if (sizeText !== "" && size === undefined) {
          warnings.push({ line, code: "unknown-size", message: `Unknown size "${sizeText}".` });
        }

        tasks.push({
          id,
          title: cell(columns.title),
          type: cell(columns.type),
          priority,
          size,
          status,
          notes: cell(columns.notes),
          section,
          line,
        });
      }
    }
    i = end;
  }

  return { lines, eol, tables, tasks, sections, warnings };
}
