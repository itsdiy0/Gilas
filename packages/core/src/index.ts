export const STATUSES = ["Backlog", "Next up", "In progress", "Review", "Done", "Parked"] as const;

export type Status = (typeof STATUSES)[number];
