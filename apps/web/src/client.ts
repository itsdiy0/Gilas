import { createTaskColumn, createTaskDetailsDialog } from "../../../packages/ui/src/index.js";
import {
  filterTasks,
  type SearchableTask,
  type TaskFilterKey,
  type TaskFilters,
} from "./search.js";

type TaskStatus = "Backlog" | "Next up" | "In progress" | "Review" | "Done" | "Parked";
type Priority = "P0" | "P1" | "P2" | "P3";
type BoardTheme = "light" | "dark";
type AccentColour = "blue" | "cherry" | "violet" | "teal" | "amber";

type TaskView = SearchableTask & { priority: Priority | undefined; status: TaskStatus | undefined };

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
const themeToggle = requiredElement<HTMLButtonElement>("#theme-toggle");
const themeToggleLabel = requiredElement<HTMLElement>("#theme-toggle-label");
const themeColourMeta = requiredElement<HTMLMetaElement>('meta[name="theme-color"]');
const taskSearchForm = requiredElement<HTMLFormElement>("#task-search-form");
const taskSearch = requiredElement<HTMLInputElement>("#task-search");
const filterMenu = requiredElement<HTMLDetailsElement>("#task-filter-menu");
const filterCount = requiredElement<HTMLElement>("#filter-count");
const clearSearchButton = requiredElement<HTMLButtonElement>("#clear-search");
const searchSummary = requiredElement<HTMLElement>("#search-summary");
const accentButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-accent-choice]"),
);
const missingFilterValue = "__gilas_missing__";
const filterDefinitions: {
  key: TaskFilterKey;
  select: HTMLSelectElement;
  placeholder: string;
  getValue: (task: TaskView) => string | undefined;
}[] = [
  {
    key: "type",
    select: requiredElement<HTMLSelectElement>("#type-filter"),
    placeholder: "Any type",
    getValue: (task) => task.type,
  },
  {
    key: "priority",
    select: requiredElement<HTMLSelectElement>("#priority-filter"),
    placeholder: "Any priority",
    getValue: (task) => task.priority,
  },
  {
    key: "size",
    select: requiredElement<HTMLSelectElement>("#size-filter"),
    placeholder: "Any size",
    getValue: (task) => task.size,
  },
  {
    key: "section",
    select: requiredElement<HTMLSelectElement>("#milestone-filter"),
    placeholder: "Any milestone",
    getValue: (task) => task.section,
  },
];

let currentPayload: BoardPayload | undefined;
let pointerDrag: PointerDrag | undefined;
let keyboardDrag: KeyboardDrag | undefined;
const pendingMoves = new Set<string>();

function requiredElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (node === null) throw new Error(`The Gilas board page is missing ${selector}.`);
  return node;
}

function readPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (value !== null && allowed.includes(value as T)) return value as T;
  } catch {
    // Keep appearance controls usable when browser storage is unavailable.
  }
  return fallback;
}

function savePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The selected appearance still applies for this visit.
  }
}

function applyTheme(theme: BoardTheme): void {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  themeToggleLabel.textContent = theme === "dark" ? "Dark" : "Light";
  themeColourMeta.content = theme === "dark" ? "#171923" : "#f2f2f7";
}

function applyAccent(accent: AccentColour): void {
  document.documentElement.dataset.accent = accent;
  for (const button of accentButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.accentChoice === accent));
  }
}

function initialiseAppearanceControls(): void {
  const themes = ["light", "dark"] as const;
  const accents = ["blue", "cherry", "violet", "teal", "amber"] as const;
  const theme = readPreference("gilas-theme", themes, "light");
  const accent = readPreference("gilas-accent", accents, "blue");
  applyTheme(theme);
  applyAccent(accent);

  themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    savePreference("gilas-theme", nextTheme);
  });
  for (const button of accentButtons) {
    button.addEventListener("click", () => {
      const nextAccent = button.dataset.accentChoice;
      if (
        nextAccent === "blue" ||
        nextAccent === "cherry" ||
        nextAccent === "violet" ||
        nextAccent === "teal" ||
        nextAccent === "amber"
      ) {
        applyAccent(nextAccent);
        savePreference("gilas-accent", nextAccent);
      }
    });
  }
}

function encodeFilterOption(value: string | undefined): string {
  return value === undefined ? missingFilterValue : `value:${value}`;
}

function decodeFilterSelection(value: string): string | null | undefined {
  if (value === "") return undefined;
  if (value === missingFilterValue) return null;
  return value.startsWith("value:") ? value.slice("value:".length) : undefined;
}

function updateFilterOptions(tasks: TaskView[]): void {
  for (const definition of filterDefinitions) {
    const previousValue = definition.select.value;
    const values = new Set<string>();
    let hasMissing = false;
    for (const task of tasks) {
      const value = definition.getValue(task)?.trim();
      if (value === undefined || value === "") hasMissing = true;
      else values.add(value);
    }
    if (previousValue === missingFilterValue) hasMissing = true;
    if (previousValue.startsWith("value:")) {
      values.add(previousValue.slice("value:".length));
    }

    const options = [new Option(definition.placeholder, "")];
    for (const value of Array.from(values).sort((left, right) =>
      left.localeCompare(right, "en-GB"),
    )) {
      options.push(new Option(value, encodeFilterOption(value)));
    }
    if (hasMissing) options.push(new Option("Not set", missingFilterValue));
    definition.select.replaceChildren(...options);
    definition.select.value = previousValue;
  }
}

function readTaskFilters(): TaskFilters {
  const filters: TaskFilters = {};
  for (const definition of filterDefinitions) {
    const value = decodeFilterSelection(definition.select.value);
    if (value !== undefined) filters[definition.key] = value;
  }
  return filters;
}

function updateSearchControls(tasks: TaskView[]): TaskView[] {
  updateFilterOptions(tasks);
  const filters = readTaskFilters();
  const activeFilterCount = filterDefinitions.filter((definition) => {
    return definition.select.value !== "";
  }).length;
  const active = taskSearch.value.trim() !== "" || activeFilterCount > 0;
  const matchingTasks = filterTasks(tasks, taskSearch.value, filters);
  filterCount.textContent = String(activeFilterCount);
  filterCount.hidden = activeFilterCount === 0;
  clearSearchButton.hidden = !active;
  const totalLabel = tasks.length === 1 ? "task" : "tasks";
  searchSummary.textContent = active
    ? `${matchingTasks.length} of ${tasks.length} ${totalLabel}`
    : `${tasks.length} ${totalLabel}`;
  return matchingTasks;
}

function initialiseSearchControls(): void {
  taskSearchForm.addEventListener("submit", (event) => event.preventDefault());
  taskSearch.addEventListener("input", () => {
    if (currentPayload !== undefined) render(currentPayload);
  });
  for (const definition of filterDefinitions) {
    definition.select.addEventListener("change", () => {
      if (currentPayload !== undefined) render(currentPayload);
    });
  }
  clearSearchButton.addEventListener("click", () => {
    taskSearch.value = "";
    for (const definition of filterDefinitions) definition.select.value = "";
    if (currentPayload !== undefined) render(currentPayload);
    taskSearch.focus();
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !filterMenu.contains(event.target)) filterMenu.open = false;
  });
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
  card.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".drag-handle") !== null) return;
    openTaskDetails(task, card);
  });
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

function openTaskDetails(task: TaskView, trigger: HTMLElement): void {
  const dialog = createTaskDetailsDialog(task);
  document.body.append(dialog);
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      if (trigger.isConnected) trigger.focus();
    },
    { once: true },
  );
  dialog.showModal();
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

function renderColumn(
  title: string,
  tasks: TaskView[],
  status?: TaskStatus,
  emptyMessage = "Drop a task here",
): HTMLElement {
  const section = createTaskColumn(title, tasks, {
    ...(status === undefined ? {} : { status }),
    emptyMessage,
    showDragHandles: true,
    onCardCreated: (card, task, handle) => {
      if (handle !== undefined) addCardDragHandlers(card, task, handle);
    },
  });
  if (status !== undefined) addColumnDropHandlers(section, status);
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
  const matchingTasks = updateSearchControls(payload.tasks);
  const searchIsActive =
    taskSearch.value.trim() !== "" ||
    filterDefinitions.some((definition) => definition.select.value !== "");
  const emptyMessage = searchIsActive ? "No matching tasks" : "Drop a task here";

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
        matchingTasks.filter((task) => task.status === status),
        status,
        emptyMessage,
      ),
    );
  }
  const unrecognised = matchingTasks.filter((task) => task.status === undefined);
  if (unrecognised.length > 0) {
    board.append(renderColumn("Unrecognised status", unrecognised, undefined, emptyMessage));
  }
  board.setAttribute("aria-busy", "false");
  renderWarnings(payload.warnings);
}

function handleKeyboardDrag(event: KeyboardEvent, card: HTMLElement, task: TaskView): void {
  const isDragHandle =
    event.target instanceof Element && event.target.closest(".drag-handle") !== null;
  if (event.code === "Enter" && keyboardDrag === undefined && !isDragHandle) {
    event.preventDefault();
    openTaskDetails(task, card);
    return;
  }
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

initialiseAppearanceControls();
initialiseSearchControls();
void loadBoardAndConnect();
