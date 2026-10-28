type TaskStatus = "Backlog" | "Next up" | "In progress" | "Review" | "Done" | "Parked";
type Priority = "P0" | "P1" | "P2" | "P3";

interface TaskView {
  id: string;
  title: string;
  type: string;
  priority: Priority | undefined;
  size: string | undefined;
  status: TaskStatus | undefined;
  notes: string;
  section: string | undefined;
}

interface BoardWarning {
  line: number;
  message: string;
}

interface BoardPayload {
  source: string;
  tasks: TaskView[];
  warnings: BoardWarning[];
  updatedAt: string;
  error?: string;
}

interface PointerDrag {
  taskId: string;
  pointerId: number;
  card: HTMLElement;
  handle: HTMLButtonElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  timer: number;
  active: boolean;
  ghost: HTMLElement | undefined;
  target: HTMLElement | undefined;
  targetStatus: TaskStatus | undefined;
  targetTaskId: string | undefined;
  targetPosition: "beforeId" | "afterId" | undefined;
}

interface KeyboardDrag {
  taskId: string;
  card: HTMLElement;
  targetIndex: number;
}

const statuses: TaskStatus[] = ["Backlog", "Next up", "In progress", "Review", "Done", "Parked"];
const board = requiredElement<HTMLElement>("#board");
const sourceName = requiredElement<HTMLElement>("#source-name");
const connectionStatus = requiredElement<HTMLElement>("#connection-status");
const connectionDot = requiredElement<HTMLElement>("#connection-dot");
const lastUpdated = requiredElement<HTMLElement>("#last-updated");
const warningsSection = requiredElement<HTMLElement>("#warnings");
const warningList = requiredElement<HTMLUListElement>("#warning-list");

let currentPayload: BoardPayload | undefined;
let pointerDrag: PointerDrag | undefined;
let keyboardDrag: KeyboardDrag | undefined;
const pendingMoves = new Set<string>();

function requiredElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (node === null) throw new Error(`The Gilas board page is missing ${selector}.`);
  return node;
}

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setConnection(state: "connecting" | "live" | "offline", message: string): void {
  connectionStatus.textContent = message;
  connectionDot.classList.remove("is-live", "is-offline");
  if (state === "live") connectionDot.classList.add("is-live");
  if (state === "offline") connectionDot.classList.add("is-offline");
}

function clearDropTargets(): void {
  document.querySelectorAll(".column.is-drop-target").forEach((column) => {
    column.classList.remove("is-drop-target");
  });
}

function markDropTarget(status: TaskStatus): void {
  clearDropTargets();
  for (const column of document.querySelectorAll<HTMLElement>(".column[data-drop-status]")) {
    if (column.dataset.dropStatus === status) column.classList.add("is-drop-target");
  }
}

async function loadBoard(): Promise<void> {
  try {
    const response = await fetch("/api/board");
    if (!response.ok) throw new Error(`Board request failed (${response.status}).`);
    render((await response.json()) as BoardPayload);
    setConnection("live", "Live updates connected");
  } catch {
    setConnection("offline", "Could not connect to the board");
  }
}

async function moveTask(
  taskId: string,
  status: TaskStatus,
  position?: { beforeId: string } | { afterId: string },
): Promise<void> {
  const task = currentPayload?.tasks.find((item) => item.id === taskId);
  if (task === undefined || pendingMoves.has(taskId)) return;
  if (position !== undefined) {
    const anchorId = "beforeId" in position ? position.beforeId : position.afterId;
    const anchor = currentPayload?.tasks.find((item) => item.id === anchorId);
    if (anchor !== undefined && anchor.section !== task.section) {
      if (task.status === status) {
        setConnection("live", "Tasks can only be reordered within the same milestone");
        return;
      }
      position = undefined;
    }
  }
  if (task.status === status && position === undefined) {
    setConnection("live", `${taskId} is already in ${status}`);
    return;
  }

  pendingMoves.add(taskId);
  setConnection("connecting", `Moving ${taskId} to ${status}…`);
  try {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...position }),
    });
    const result = (await response.json()) as BoardPayload | { error: string };
    if (!response.ok || ("error" in result && result.error !== undefined)) {
      throw new Error("error" in result ? result.error : `Save failed (${response.status}).`);
    }
    render(result as BoardPayload);
    setConnection("live", `${taskId} moved to ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The task could not be moved.";
    await loadBoard();
    setConnection("live", `Move failed: ${message}`);
  } finally {
    pendingMoves.delete(taskId);
  }
}

function renderWarnings(warnings: BoardWarning[]): void {
  warningList.replaceChildren();
  warningsSection.hidden = warnings.length === 0;
  for (const warning of warnings) {
    warningList.append(element("li", undefined, `Line ${warning.line}: ${warning.message}`));
  }
}

function addCardDragHandlers(card: HTMLElement, task: TaskView, handle: HTMLButtonElement): void {
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.addEventListener("dragstart", (event) => {
    if (event.dataTransfer === null) return;
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
    clearDropTargets();
  });
  card.addEventListener("dragover", (event) => {
    if (event.dataTransfer === null || !event.dataTransfer.types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    card.classList.add("is-card-drop-target");
  });
  card.addEventListener("dragleave", (event) => {
    if (!card.contains(event.relatedTarget as Node | null))
      card.classList.remove("is-card-drop-target");
  });
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("is-card-drop-target");
    const taskId = event.dataTransfer?.getData("text/plain");
    if (taskId === undefined || taskId === "" || taskId === task.id || task.status === undefined)
      return;
    const position =
      event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2
        ? { beforeId: task.id }
        : { afterId: task.id };
    void moveTask(taskId, task.status, position);
  });
  card.addEventListener("keydown", (event) => handleKeyboardDrag(event, card, task));
  handle.addEventListener("pointerdown", (event) => beginPointerDrag(event, card, task, handle));
}

function renderTask(task: TaskView): HTMLElement {
  const priorityClass = task.priority?.toLowerCase() ?? "none";
  const card = element("article", `task-card priority-${priorityClass}`);
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${task.id}: ${task.title}`);
  card.append(element("p", "task-id", task.id));
  card.append(element("h4", undefined, task.title));

  const handle = element("button", "drag-handle", "⠿");
  handle.type = "button";
  handle.setAttribute("aria-label", `Drag ${task.id} to reorder or change status`);
  card.append(handle);
  addCardDragHandlers(card, task, handle);

  if (task.section !== undefined) card.append(element("p", "task-notes", task.section));
  if (task.notes !== "") card.append(element("p", "task-notes", task.notes));

  const labels = element("div", "task-labels");
  if (task.type !== "") labels.append(element("span", "task-label", task.type));
  if (task.priority !== undefined) {
    labels.append(
      element("span", `task-label priority priority-${task.priority.toLowerCase()}`, task.priority),
    );
  }
  if (task.size !== undefined) labels.append(element("span", "task-label size", task.size));
  if (labels.childElementCount > 0) card.append(labels);
  return card;
}

function addColumnDropHandlers(column: HTMLElement, status: TaskStatus): void {
  column.dataset.dropStatus = status;
  column.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    column.classList.add("is-drop-target");
  });
  column.addEventListener("dragleave", (event) => {
    if (!column.contains(event.relatedTarget as Node | null)) {
      column.classList.remove("is-drop-target");
    }
  });
  column.addEventListener("drop", (event) => {
    event.preventDefault();
    column.classList.remove("is-drop-target");
    const taskId = event.dataTransfer?.getData("text/plain");
    if (taskId !== undefined && taskId !== "") {
      const tasks = currentPayload?.tasks.filter((task) => task.status === status) ?? [];
      const last = tasks[tasks.length - 1];
      void moveTask(taskId, status, last === undefined ? undefined : { afterId: last.id });
    }
  });
}

function renderColumn(title: string, tasks: TaskView[], status?: TaskStatus): HTMLElement {
  const section = element("section", "column");
  if (status !== undefined) addColumnDropHandlers(section, status);
  const heading = element("div", "column-heading");
  const headingId = `column-${title.toLowerCase().replaceAll(" ", "-")}`;
  const headingTitle = element("h3", undefined, title);
  headingTitle.id = headingId;
  section.setAttribute("aria-labelledby", headingId);
  heading.append(headingTitle, element("span", "column-count", String(tasks.length)));
  section.append(heading);

  const list = element("div", "task-list");
  if (tasks.length === 0) {
    list.append(element("p", "empty-column", "Drop a task here"));
  } else {
    for (const task of tasks) list.append(renderTask(task));
  }
  section.append(list);
  return section;
}

function render(payload: BoardPayload): void {
  currentPayload = payload;
  sourceName.textContent = payload.source;
  lastUpdated.textContent = `Updated ${new Date(payload.updatedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  board.replaceChildren();

  if (payload.error !== undefined) {
    board.setAttribute("aria-busy", "false");
    board.append(element("p", "empty-column", payload.error));
    renderWarnings([]);
    return;
  }

  for (const status of statuses) {
    board.append(
      renderColumn(
        status,
        payload.tasks.filter((task) => task.status === status),
        status,
      ),
    );
  }
  const unrecognised = payload.tasks.filter((task) => task.status === undefined);
  if (unrecognised.length > 0) board.append(renderColumn("Unrecognised status", unrecognised));
  board.setAttribute("aria-busy", "false");
  renderWarnings(payload.warnings);
}

function handleKeyboardDrag(event: KeyboardEvent, card: HTMLElement, task: TaskView): void {
  if (keyboardDrag?.taskId !== task.id) {
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      const siblings = Array.from(
        card.parentElement?.querySelectorAll<HTMLElement>(".task-card") ?? [],
      );
      const index = siblings.indexOf(card);
      const neighbour = siblings[index + (event.code === "ArrowUp" ? -1 : 1)];
      const neighbourId = neighbour?.dataset.taskId;
      if (neighbourId !== undefined && task.status !== undefined) {
        event.preventDefault();
        const position =
          event.code === "ArrowUp" ? { beforeId: neighbourId } : { afterId: neighbourId };
        void moveTask(task.id, task.status, position);
      }
      return;
    }
    if (event.code !== "Space") return;
    event.preventDefault();
    const initial = task.status === undefined ? 0 : statuses.indexOf(task.status);
    keyboardDrag = { taskId: task.id, card, targetIndex: Math.max(0, initial) };
    card.classList.add("is-keyboard-dragging");
    markDropTarget(statuses[keyboardDrag.targetIndex] as TaskStatus);
    setConnection(
      "connecting",
      `Picked up ${task.id}. Use the arrow keys to choose a status, then press Enter.`,
    );
    return;
  }

  if (event.code === "Escape") {
    event.preventDefault();
    keyboardDrag.card.classList.remove("is-keyboard-dragging");
    keyboardDrag = undefined;
    clearDropTargets();
    setConnection("live", "Move cancelled");
  } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
    event.preventDefault();
    const step = event.code === "ArrowRight" ? 1 : -1;
    keyboardDrag.targetIndex = Math.min(
      statuses.length - 1,
      Math.max(0, keyboardDrag.targetIndex + step),
    );
    const targetStatus = statuses[keyboardDrag.targetIndex] as TaskStatus;
    markDropTarget(targetStatus);
    setConnection("connecting", `${task.id} will move to ${targetStatus}. Press Enter to drop.`);
  } else if (event.code === "Enter" || event.code === "Space") {
    event.preventDefault();
    const targetStatus = statuses[keyboardDrag.targetIndex] as TaskStatus;
    keyboardDrag.card.classList.remove("is-keyboard-dragging");
    keyboardDrag = undefined;
    clearDropTargets();
    void moveTask(task.id, targetStatus);
  }
}

function beginPointerDrag(
  event: PointerEvent,
  card: HTMLElement,
  task: TaskView,
  handle: HTMLButtonElement,
): void {
  if (event.pointerType !== "touch") return;
  event.preventDefault();
  if (pointerDrag !== undefined) finishPointerDrag();
  const drag: PointerDrag = {
    taskId: task.id,
    pointerId: event.pointerId,
    card,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    timer: 0,
    active: false,
    ghost: undefined,
    target: undefined,
    targetStatus: undefined,
    targetTaskId: undefined,
    targetPosition: undefined,
  };
  drag.timer = window.setTimeout(() => activatePointerDrag(drag), 220);
  pointerDrag = drag;
}

function activatePointerDrag(drag: PointerDrag): void {
  if (pointerDrag !== drag) return;
  drag.active = true;
  drag.card.classList.add("is-dragging");
  document.body.classList.add("is-pointer-dragging");
  const ghost = drag.card.cloneNode(true) as HTMLElement;
  ghost.classList.remove("is-dragging");
  ghost.classList.add("drag-preview");
  ghost.setAttribute("aria-hidden", "true");
  ghost.draggable = false;
  document.body.append(ghost);
  drag.ghost = ghost;
  try {
    drag.handle.setPointerCapture(drag.pointerId);
  } catch {
    // The pointer may have ended while the long-press timer was firing.
  }
  updatePointerDrag(drag, drag.x, drag.y);
}

function updatePointerDrag(drag: PointerDrag, x: number, y: number): void {
  if (drag.ghost !== undefined) {
    drag.ghost.style.left = `${x + 14}px`;
    drag.ghost.style.top = `${y + 14}px`;
  }
  const target =
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-task-id], [data-drop-status]") ??
    undefined;
  const taskTarget = target?.dataset.taskId;
  const columnTarget =
    taskTarget === undefined ? target : target?.closest<HTMLElement>("[data-drop-status]");
  const status =
    statuses.find((item) => item === columnTarget?.dataset.dropStatus) ??
    currentPayload?.tasks.find((item) => item.id === taskTarget)?.status;
  if (drag.target !== target) {
    drag.target?.classList.remove("is-drop-target", "is-card-drop-target");
    if (status !== undefined) {
      target?.classList.add(taskTarget === undefined ? "is-drop-target" : "is-card-drop-target");
    }
  }
  drag.target = status === undefined ? undefined : (target ?? undefined);
  drag.targetStatus = status;
  drag.targetTaskId = taskTarget;
  drag.targetPosition =
    taskTarget === undefined
      ? undefined
      : y < (target?.getBoundingClientRect().top ?? 0) + (target?.offsetHeight ?? 0) / 2
        ? "beforeId"
        : "afterId";
}

function finishPointerDrag(drop = false): void {
  const drag = pointerDrag;
  if (drag === undefined) return;
  window.clearTimeout(drag.timer);
  drag.card.classList.remove("is-dragging");
  drag.target?.classList.remove("is-drop-target", "is-card-drop-target");
  drag.ghost?.remove();
  document.body.classList.remove("is-pointer-dragging");
  pointerDrag = undefined;
  if (drop && drag.active && drag.targetStatus !== undefined) {
    const position =
      drag.targetTaskId === undefined || drag.targetPosition === undefined
        ? undefined
        : ({ [drag.targetPosition]: drag.targetTaskId } as
            | { beforeId: string }
            | { afterId: string });
    void moveTask(drag.taskId, drag.targetStatus, position);
  }
}

document.addEventListener(
  "pointermove",
  (event) => {
    const drag = pointerDrag;
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 12) finishPointerDrag();
      return;
    }
    event.preventDefault();
    updatePointerDrag(drag, drag.x, drag.y);
  },
  { passive: false },
);
document.addEventListener("pointerup", (event) => {
  if (pointerDrag?.pointerId === event.pointerId) finishPointerDrag(true);
});
document.addEventListener("pointercancel", (event) => {
  if (pointerDrag?.pointerId === event.pointerId) finishPointerDrag();
});
window.addEventListener("blur", () => finishPointerDrag());

async function loadBoardAndConnect(): Promise<void> {
  const updates = new EventSource("/api/events");
  updates.addEventListener("open", () => setConnection("live", "Live updates connected"));
  updates.addEventListener("error", () => setConnection("offline", "Reconnecting to the board…"));
  updates.addEventListener("board", (event) => {
    try {
      render(JSON.parse((event as MessageEvent<string>).data) as BoardPayload);
      setConnection("live", "Live updates connected");
    } catch {
      setConnection("offline", "The board update could not be read");
    }
  });
  updates.addEventListener("watch-error", () => {
    setConnection("offline", "File watching stopped. Restart the board to reconnect.");
  });
  await loadBoard();
}

void loadBoardAndConnect();
