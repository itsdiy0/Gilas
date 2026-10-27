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

const statuses: TaskStatus[] = ["Backlog", "Next up", "In progress", "Review", "Done", "Parked"];
function requiredElement<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (node === null) throw new Error(`The Gilas board page is missing ${selector}.`);
  return node;
}

const board = requiredElement<HTMLElement>("#board");
const sourceName = requiredElement<HTMLElement>("#source-name");
const connectionStatus = requiredElement<HTMLElement>("#connection-status");
const connectionDot = requiredElement<HTMLElement>("#connection-dot");
const lastUpdated = requiredElement<HTMLElement>("#last-updated");
const warningsSection = requiredElement<HTMLElement>("#warnings");
const warningList = requiredElement<HTMLUListElement>("#warning-list");

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

function renderWarnings(warnings: BoardWarning[]): void {
  warningList.replaceChildren();
  warningsSection.hidden = warnings.length === 0;
  for (const warning of warnings) {
    warningList.append(element("li", undefined, `Line ${warning.line}: ${warning.message}`));
  }
}

function renderTask(task: TaskView): HTMLElement {
  const priorityClass = task.priority?.toLowerCase() ?? "none";
  const card = element("article", `task-card priority-${priorityClass}`);
  card.append(element("p", "task-id", task.id));
  card.append(element("h4", undefined, task.title));

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

function renderColumn(title: string, tasks: TaskView[]): HTMLElement {
  const section = element("section", "column");
  const heading = element("div", "column-heading");
  const headingId = `column-${title.toLowerCase().replaceAll(" ", "-")}`;
  const headingTitle = element("h3", undefined, title);
  headingTitle.id = headingId;
  section.setAttribute("aria-labelledby", headingId);
  heading.append(headingTitle, element("span", "column-count", String(tasks.length)));
  section.append(heading);

  const list = element("div", "task-list");
  if (tasks.length === 0) {
    list.append(element("p", "empty-column", "Nothing here yet"));
  } else {
    for (const task of tasks) list.append(renderTask(task));
  }
  section.append(list);
  return section;
}

function render(payload: BoardPayload): void {
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
      ),
    );
  }
  const unrecognised = payload.tasks.filter((task) => task.status === undefined);
  if (unrecognised.length > 0) board.append(renderColumn("Unrecognised status", unrecognised));
  board.setAttribute("aria-busy", "false");
  renderWarnings(payload.warnings);
}

function setConnection(state: "connecting" | "live" | "offline", message: string): void {
  connectionStatus.textContent = message;
  connectionDot.classList.remove("is-live", "is-offline");
  if (state === "live") connectionDot.classList.add("is-live");
  if (state === "offline") connectionDot.classList.add("is-offline");
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

void loadBoard();
