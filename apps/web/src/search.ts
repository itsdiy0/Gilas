export interface SearchableTask {
  id: string;
  title: string;
  type: string;
  priority: string | undefined;
  size: string | undefined;
  status: string | undefined;
  notes: string;
  section: string | undefined;
}

export type TaskFilterKey = "type" | "priority" | "size" | "section";

export type TaskFilters = Partial<Record<TaskFilterKey, string | null>>;

function normalise(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed.toLocaleLowerCase("en-GB");
}

export function filterTasks<T extends SearchableTask>(
  tasks: readonly T[],
  query: string,
  filters: TaskFilters,
): T[] {
  const search = query.trim().toLocaleLowerCase("en-GB");
  return tasks.filter((task) => {
    const fields: Record<TaskFilterKey, string | undefined> = {
      type: task.type,
      priority: task.priority,
      size: task.size,
      section: task.section,
    };

    for (const key of ["type", "priority", "size", "section"] as const) {
      const expected = filters[key];
      if (expected === undefined) continue;
      const actual = normalise(fields[key]);
      if (expected === null ? actual !== undefined : actual !== normalise(expected)) return false;
    }

    if (search === "") return true;
    const searchableText = [
      task.id,
      task.title,
      task.type,
      task.priority,
      task.size,
      task.status,
      task.notes,
      task.section,
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ")
      .toLocaleLowerCase("en-GB");
    return searchableText.includes(search);
  });
}
