import type { ParseWarning, Status, Task } from "../../../packages/core/src/index.js";
import { GilasError, parse, parseStatus, setStatus } from "../../../packages/core/src/index.js";

export interface TaskBoardSnapshot {
  tasks: Task[];
  warnings: ParseWarning[];
}

export function readTaskBoard(source: string): TaskBoardSnapshot {
  const document = parse(source);
  return { tasks: document.tasks, warnings: document.warnings };
}

export function updateTaskBoardStatus(source: string, id: string, value: string): string {
  const status: Status | undefined = parseStatus(value);
  if (status === undefined) {
    throw new GilasError("invalid-value", "That task status is not recognised.");
  }
  return setStatus(source, id, status);
}
