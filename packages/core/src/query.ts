import type { Task, TaskDocument } from "./types.js";

const ID = /^(.*?)-(\d+)$/;
const STATUS_ORDER = ["Next up", "Backlog"];
const PRIORITY_ORDER = ["P0", "P1", "P2", "P3"];

/** IDs are matched ignoring case. */
export const findTasks = (doc: TaskDocument, id: string): Task[] =>
  doc.tasks.filter((task) => task.id.toLowerCase() === id.trim().toLowerCase());

/** The next free ID: highest number plus one, using the file's most common prefix. */
export function nextId(doc: TaskDocument, prefix?: string): string {
  const counts = new Map<string, number>();
  const byPrefix = new Map<string, { value: number; digits: string }>();
  for (const { id } of doc.tasks) {
    const match = ID.exec(id);
    if (match === null) continue;
    const [, name = "", digits = ""] = match;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    const best = byPrefix.get(name);
    if (best === undefined || Number(digits) > best.value) {
      byPrefix.set(name, { value: Number(digits), digits });
    }
  }

  const chosen =
    prefix ??
    [...counts.entries()].reduce<[string, number] | undefined>(
      (top, entry) => (top === undefined || entry[1] > top[1] ? entry : top),
      undefined,
    )?.[0] ??
    "T";
  const best = byPrefix.get(chosen);
  const next = String((best?.value ?? 0) + 1);
  const width = best?.digits.startsWith("0") ? best.digits.length : 0;
  return `${chosen}-${next.padStart(width, "0")}`;
}

/** Next up before Backlog, then highest priority, then file order. */
export function nextTask(doc: TaskDocument, options: { section?: string } = {}): Task | undefined {
  const rank = (list: string[], value: string | undefined) => {
    const index = value === undefined ? -1 : list.indexOf(value);
    return index === -1 ? list.length : index;
  };
  return doc.tasks
    .filter((task) => task.status !== undefined && STATUS_ORDER.includes(task.status))
    .filter((task) => options.section === undefined || task.section === options.section)
    .map((task, order) => ({ task, order }))
    .sort(
      (a, b) =>
        rank(STATUS_ORDER, a.task.status) - rank(STATUS_ORDER, b.task.status) ||
        rank(PRIORITY_ORDER, a.task.priority) - rank(PRIORITY_ORDER, b.task.priority) ||
        a.order - b.order,
    )[0]?.task;
}
