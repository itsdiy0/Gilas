import type { Status, Task } from "../../../packages/core/src/index.js";
import { STATUSES } from "../../../packages/core/src/index.js";
import { createTaskColumn } from "../../../packages/ui/src/index.js";

interface VsCodeApi {
  postMessage(message: { type: string; id?: string; status?: string }): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

type IncomingMessage =
  | {
      type: "board";
      fileName: string;
      tasks: Task[];
      warnings: { line: number; message: string }[];
    }
  | { type: "error"; message: string };

const vscode = acquireVsCodeApi();
const board = document.getElementById("board");
const fileName = document.getElementById("file-name");
const message = document.getElementById("editor-message");
const warnings = document.getElementById("warnings");
const warningList = document.getElementById("warning-list");
const openRawButton = document.getElementById("open-raw");

function getElement<T extends HTMLElement>(value: Element | null, label: string): T {
  if (value === null) throw new Error("The Gilas editor is missing " + label + ".");
  return value as T;
}

function setMessage(text: string): void {
  getElement<HTMLElement>(message, "its status message").textContent = text;
}

function editStatus(card: HTMLElement, task: Task): void {
  card.removeAttribute("aria-haspopup");
  card.tabIndex = -1;

  const controls = document.createElement("div");
  controls.className = "task-status-control";

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Status for " + task.id);
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = task.status ?? "Choose a status";
  placeholder.selected = task.status === undefined;
  placeholder.disabled = task.status !== undefined;
  select.append(placeholder);

  for (const status of STATUSES) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    select.append(option);
  }
  select.value = task.status ?? "";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save status";
  save.disabled = true;

  select.addEventListener("change", () => {
    save.disabled = select.value === "" || select.value === task.status;
  });
  save.addEventListener("click", () => {
    if (select.value === "" || !STATUSES.includes(select.value as Status)) return;
    save.disabled = true;
    setMessage("Saving " + task.id + "...");
    vscode.postMessage({ type: "setStatus", id: task.id, status: select.value });
  });

  controls.append(select, save);
  card.append(controls);
}

function showWarnings(items: { line: number; message: string }[]): void {
  const warningSection = getElement<HTMLElement>(warnings, "its warnings");
  const list = getElement<HTMLElement>(warningList, "its warning list");
  list.replaceChildren();

  for (const item of items) {
    const warning = document.createElement("li");
    warning.textContent = "Line " + item.line + ": " + item.message;
    list.append(warning);
  }
  warningSection.hidden = items.length === 0;
}

function showBoard(tasks: Task[]): void {
  const taskBoard = getElement<HTMLElement>(board, "its task board");
  const columns = document.createDocumentFragment();

  for (const status of STATUSES) {
    const statusTasks = tasks.filter((task) => task.status === status);
    columns.append(
      createTaskColumn(status, statusTasks, {
        document,
        onCardCreated: (card, task) => editStatus(card, task),
      }),
    );
  }

  const unrecognised = tasks.filter((task) => task.status === undefined);
  if (unrecognised.length > 0) {
    columns.append(
      createTaskColumn("Needs attention", unrecognised, {
        document,
        emptyMessage: "No tasks need attention.",
        onCardCreated: (card, task) => editStatus(card, task),
      }),
    );
  }
  taskBoard.replaceChildren(columns);
}

function isIncomingMessage(value: unknown): value is IncomingMessage {
  if (value === null || typeof value !== "object" || !("type" in value)) return false;
  if (value.type === "error") return "message" in value && typeof value.message === "string";
  return (
    value.type === "board" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "tasks" in value &&
    Array.isArray(value.tasks) &&
    "warnings" in value &&
    Array.isArray(value.warnings)
  );
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isIncomingMessage(event.data)) return;

  if (event.data.type === "error") {
    setMessage(event.data.message);
    return;
  }
  if (event.data.type !== "board") return;

  getElement<HTMLElement>(fileName, "its file name").textContent = event.data.fileName;
  showWarnings(event.data.warnings);
  showBoard(event.data.tasks);
  setMessage("Changes are saved to the Markdown document when you save the file.");
});

getElement<HTMLButtonElement>(openRawButton, "its Markdown toggle").addEventListener(
  "click",
  () => {
    vscode.postMessage({ type: "openRawText" });
  },
);

vscode.postMessage({ type: "ready" });
