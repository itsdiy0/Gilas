export const STATUSES = ["Backlog", "Next up", "In progress", "Review", "Done", "Parked"] as const;
export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export const SIZES = ["XS", "S", "M", "L", "XL"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Size = (typeof SIZES)[number];

export interface Task {
  id: string;
  title: string;
  type: string;
  /** Undefined when the cell is empty or not recognised (see the warnings). */
  priority: Priority | undefined;
  size: Size | undefined;
  status: Status | undefined;
  notes: string;
  /** Text of the nearest `##` heading above the table. */
  section: string | undefined;
  /** 1-based line number of the row. */
  line: number;
}

export type WarningCode =
  | "missing-id"
  | "duplicate-id"
  | "unknown-status"
  | "unknown-priority"
  | "unknown-size";

export interface ParseWarning {
  /** 1-based line number. */
  line: number;
  code: WarningCode;
  message: string;
}

export interface Section {
  name: string;
  /** 1-based line number of the heading. */
  line: number;
}

/** Zero-based cell positions within a row. Optional columns are undefined when absent. */
export interface Columns {
  id: number;
  title: number;
  status: number;
  type: number | undefined;
  priority: number | undefined;
  size: number | undefined;
  notes: number | undefined;
}

export interface TaskTable {
  section: string | undefined;
  /** Zero-based index of the header line. */
  headerIndex: number;
  /** Zero-based index of the first data row. */
  firstRow: number;
  /** Zero-based index one past the last data row. */
  endRow: number;
  columns: Columns;
}

export interface Line {
  text: string;
  /** "\n", "\r\n", or "" for a last line with no line ending. */
  terminator: string;
}

export interface TaskDocument {
  lines: Line[];
  /** The first line ending found, used for new lines. */
  eol: string;
  tables: TaskTable[];
  tasks: Task[];
  sections: Section[];
  warnings: ParseWarning[];
}

export type ErrorCode =
  | "task-not-found"
  | "duplicate-id"
  | "column-missing"
  | "invalid-value"
  | "no-table"
  | "section-not-found";

export class GilasError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "GilasError";
    this.code = code;
  }
}
