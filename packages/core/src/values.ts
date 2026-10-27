import type { Priority, Size, Status } from "./types.js";
import { PRIORITIES, SIZES, STATUSES } from "./types.js";

const key = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();

const STATUS_BY_KEY = new Map<string, Status>(STATUSES.map((s) => [key(s), s]));

const PRIORITY_BY_KEY = new Map<string, Priority>([
  ...PRIORITIES.map((p): [string, Priority] => [p.toLowerCase(), p]),
  ["critical", "P0"],
  ["high", "P1"],
  ["medium", "P2"],
  ["med", "P2"],
  ["low", "P3"],
]);

const SIZE_BY_KEY = new Map<string, Size>(SIZES.map((s) => [s.toLowerCase(), s]));

export const parseStatus = (value: string): Status | undefined => STATUS_BY_KEY.get(key(value));
export const parsePriority = (value: string): Priority | undefined =>
  PRIORITY_BY_KEY.get(key(value));
export const parseSize = (value: string): Size | undefined => SIZE_BY_KEY.get(key(value));
