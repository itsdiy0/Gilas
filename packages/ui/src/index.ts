export interface TaskCardData {
  id: string;
  title: string;
  type: string;
  priority: string | undefined;
  size: string | undefined;
  status?: string | undefined;
  notes: string;
  section: string | undefined;
}

export interface TaskColumnOptions<T extends TaskCardData> {
  document?: Document;
  status?: string | undefined;
  emptyMessage?: string;
  showDragHandles?: boolean;
  onCardCreated?: (card: HTMLElement, task: T, handle: HTMLButtonElement | undefined) => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function priorityClassName(priority: string | undefined): string {
  return priority !== undefined && /^P[0-3]$/i.test(priority) ? priority.toLowerCase() : "none";
}

export function labelToneIndex(label: string): number {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (Math.imul(hash, 31) + label.charCodeAt(index)) | 0;
  }
  return (hash >>> 0) % 6;
}

export function createTaskCard<T extends TaskCardData>(
  task: T,
  options: { document?: Document; showDragHandle?: boolean } = {},
): HTMLElement {
  const document = options.document ?? window.document;
  const card = element(
    document,
    "article",
    `task-card priority-${priorityClassName(task.priority)}`,
  );
  card.tabIndex = 0;
  card.dataset.taskId = task.id;
  card.setAttribute("aria-label", `${task.id}: ${task.title}`);
  card.setAttribute("aria-haspopup", "dialog");
  card.append(element(document, "p", "task-id", task.id));
  card.append(element(document, "h4", undefined, task.title));

  if (options.showDragHandle === true) {
    const handle = element(document, "button", "drag-handle", "⠿");
    handle.type = "button";
    handle.setAttribute("aria-label", `Drag ${task.id} to reorder or change status`);
    card.append(handle);
  }

  if (task.section !== undefined) {
    card.append(element(document, "p", "task-section", task.section));
  }
  if (task.notes !== "") card.append(element(document, "p", "task-notes", task.notes));

  const labels = element(document, "div", "task-labels");
  if (task.type !== "") {
    labels.append(
      element(
        document,
        "span",
        `task-label type label-tone-${labelToneIndex(task.type)}`,
        task.type,
      ),
    );
  }
  if (task.priority !== undefined) {
    labels.append(
      element(
        document,
        "span",
        `task-label priority priority-${priorityClassName(task.priority)}`,
        task.priority,
      ),
    );
  }
  if (task.size !== undefined)
    labels.append(element(document, "span", "task-label size", task.size));
  if (labels.childElementCount > 0) card.append(labels);
  return card;
}

export function createTaskDetailsDialog<T extends TaskCardData>(
  task: T,
  options: { document?: Document } = {},
): HTMLDialogElement {
  const document = options.document ?? window.document;
  const dialog = element(document, "dialog", "task-details-dialog");
  dialog.setAttribute("aria-labelledby", "task-details-title");

  const panel = element(document, "div", "task-details-panel");
  const header = element(document, "div", "task-details-header");
  const heading = element(document, "div");
  heading.append(element(document, "p", "task-details-eyebrow", "Task details"));
  const title = element(document, "h2", undefined, task.title);
  title.id = "task-details-title";
  heading.append(title);

  const context = element(document, "div", "task-details-context");
  context.append(element(document, "span", "task-details-id", task.id));
  const status = element(document, "span", "task-details-status", task.status ?? "Unrecognised");
  status.dataset.status = task.status?.toLowerCase().replaceAll(" ", "-") ?? "unrecognised";
  context.append(status);
  heading.append(context);

  const close = element(document, "button", "task-details-close", "Close");
  close.type = "button";
  close.setAttribute("aria-label", "Close task details");
  close.addEventListener("click", () => dialog.close());
  header.append(heading, close);
  panel.append(header);

  const description = element(document, "section", "task-details-description");
  const descriptionHeading = element(document, "div", "task-details-section-heading");
  descriptionHeading.append(element(document, "h3", undefined, "Description"));
  descriptionHeading.append(element(document, "span", "task-details-description-mark", "✦"));
  description.append(descriptionHeading);
  description.append(
    element(document, "p", undefined, task.notes === "" ? "No description provided." : task.notes),
  );
  panel.append(description);

  const details = element(document, "section", "task-details-section");
  details.append(element(document, "h3", undefined, "Details"));
  const metadata = element(document, "dl", "task-details-metadata");
  const addMetadata = (label: string, value: string | undefined) => {
    const item = element(document, "div", "task-details-item");
    item.append(element(document, "dt", undefined, label));
    item.append(element(document, "dd", undefined, value || "Not set"));
    metadata.append(item);
  };
  addMetadata("Type", task.type);
  addMetadata("Priority", task.priority);
  addMetadata("Size", task.size);
  addMetadata("Milestone", task.section);
  details.append(metadata);
  panel.append(details);

  dialog.append(panel);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

export function createTaskColumn<T extends TaskCardData>(
  title: string,
  tasks: T[],
  options: TaskColumnOptions<T> = {},
): HTMLElement {
  const document = options.document ?? window.document;
  const section = element(document, "section", "column");
  if (options.status !== undefined) section.dataset.dropStatus = options.status;

  const heading = element(document, "div", "column-heading");
  const headingId = `column-${title.toLowerCase().replaceAll(" ", "-")}`;
  const headingTitle = element(document, "h3", undefined, title);
  headingTitle.id = headingId;
  section.setAttribute("aria-labelledby", headingId);
  heading.append(headingTitle, element(document, "span", "column-count", String(tasks.length)));
  section.append(heading);

  const list = element(document, "div", "task-list");
  if (tasks.length === 0) {
    list.append(element(document, "p", "empty-column", options.emptyMessage ?? "No tasks yet"));
  } else {
    for (const task of tasks) {
      const card = createTaskCard(task, {
        document,
        showDragHandle: options.showDragHandles === true,
      });
      const handle = card.querySelector<HTMLButtonElement>(".drag-handle") ?? undefined;
      options.onCardCreated?.(card, task, handle);
      list.append(card);
    }
  }
  section.append(list);
  return section;
}
