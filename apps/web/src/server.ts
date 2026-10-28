import { watch } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, join, resolve } from "node:path";
import type { ParseWarning, Status, Task, TaskPosition } from "@gilas/core";
import {
  GilasError,
  parse,
  parseStatus,
  reorderTask,
  setStatus,
} from "../../../packages/core/src/index.js";

export interface BoardPayload {
  source: string;
  tasks: Task[];
  warnings: ParseWarning[];
  updatedAt: string;
  error?: string;
}

export interface BoardServerOptions {
  filePath: string;
}

export interface BoardServer {
  server: Server;
  close: () => Promise<void>;
}

export type WatchDirectory = (
  directory: string,
  onChange: (filename: string | Buffer | null) => void,
) => {
  close: () => void;
  on: (event: "error", listener: (error: Error) => void) => unknown;
};

const PUBLIC_DIRECTORY = resolve(process.cwd(), "public");
const CLIENT_SCRIPT = resolve(process.cwd(), "dist/browser/apps/web/src/client.js");
const SHARED_UI_SCRIPT = resolve(process.cwd(), "dist/browser/packages/ui/src/index.js");
const SHARED_UI_STYLES = resolve(process.cwd(), "../../packages/ui/src/styles.css");
const STATIC_FILES = new Map<string, { path: string; type: string }>([
  ["/", { path: join(PUBLIC_DIRECTORY, "index.html"), type: "text/html; charset=utf-8" }],
  ["/index.html", { path: join(PUBLIC_DIRECTORY, "index.html"), type: "text/html; charset=utf-8" }],
  ["/styles.css", { path: join(PUBLIC_DIRECTORY, "styles.css"), type: "text/css; charset=utf-8" }],
  ["/ui.css", { path: SHARED_UI_STYLES, type: "text/css; charset=utf-8" }],
  ["/client.js", { path: CLIENT_SCRIPT, type: "text/javascript; charset=utf-8" }],
  ["/packages/ui/src/index.js", { path: SHARED_UI_SCRIPT, type: "text/javascript; charset=utf-8" }],
]);

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 4096) throw new RequestError("Request body is too large.", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestError("Request body must be valid JSON.", 400);
  }
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function sendEvent(response: ServerResponse, name: string, value: unknown): void {
  if (response.destroyed) return;
  response.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
}

export async function loadBoard(filePath: string): Promise<BoardPayload> {
  const resolvedPath = resolve(filePath);
  const source = basename(resolvedPath);
  try {
    const content = await readFile(resolvedPath, "utf8");
    const document = parse(content);
    return {
      source,
      tasks: document.tasks,
      warnings: document.warnings,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      source,
      tasks: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
      error: `Could not read ${source}. Check that the file exists and is readable.`,
    };
  }
}

export function watchTaskFile(
  filePath: string,
  onChange: () => void,
  onError: (error: Error) => void = () => {},
  watchDirectory: WatchDirectory = (directory, notify) =>
    watch(directory, { persistent: true }, (_event, filename) => notify(filename)),
): () => void {
  const resolvedPath = resolve(filePath);
  const source = basename(resolvedPath);
  let debounceTimer: NodeJS.Timeout | undefined;
  const watcher = watchDirectory(dirname(resolvedPath), (name) => {
    if (name !== null && name.toString() !== source) return;
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      onChange();
    }, 120);
  });
  watcher.on("error", onError);

  return () => {
    watcher.close();
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  };
}

export function createTaskStatusWriter(
  filePath: string,
): (id: string, status: Status, position?: TaskPosition) => Promise<BoardPayload> {
  const resolvedPath = resolve(filePath);
  let writeQueue: Promise<void> = Promise.resolve();

  return function saveTaskStatus(
    id: string,
    status: Status,
    position?: TaskPosition,
  ): Promise<BoardPayload> {
    const operation = writeQueue.then(async () => {
      const source = await readFile(resolvedPath, "utf8");
      const statusUpdated = setStatus(source, id, status);
      const updated =
        position === undefined ? statusUpdated : reorderTask(statusUpdated, id, position);
      if (updated === source) return loadBoard(resolvedPath);

      const current = await readFile(resolvedPath, "utf8");
      if (current !== source) {
        throw new RequestError(
          "The task file changed while saving. Refresh the board and try again.",
          409,
        );
      }
      await writeFile(resolvedPath, updated, "utf8");
      return loadBoard(resolvedPath);
    });
    writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}

export function createBoardServer(options: BoardServerOptions): BoardServer {
  const filePath = resolve(options.filePath);
  const clients = new Set<ServerResponse>();
  const saveTaskStatus = createTaskStatusWriter(filePath);

  function broadcast(payload: BoardPayload): void {
    for (const client of clients) sendEvent(client, "board", payload);
  }

  const stopWatching = watchTaskFile(
    filePath,
    () => void loadBoard(filePath).then(broadcast),
    (error) => {
      for (const client of clients) sendEvent(client, "watch-error", { message: error.message });
    },
  );

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const statusUpdate = /^\/api\/tasks\/([^/]+)\/status$/.exec(url.pathname);
    if (request.method === "POST" && statusUpdate !== null) {
      void (async () => {
        try {
          if (!request.headers["content-type"]?.startsWith("application/json")) {
            throw new RequestError("Content-Type must be application/json.", 415);
          }
          const body = await readJson(request);
          if (
            body === null ||
            typeof body !== "object" ||
            !("status" in body) ||
            typeof body.status !== "string"
          ) {
            throw new RequestError("A task status is required.", 400);
          }
          const status = parseStatus(body.status);
          if (status === undefined)
            throw new RequestError("That task status is not recognised.", 400);
          const hasBefore = "beforeId" in body;
          const hasAfter = "afterId" in body;
          if (
            hasBefore === hasAfter ||
            (hasBefore && typeof body.beforeId !== "string") ||
            (hasAfter && typeof body.afterId !== "string")
          ) {
            if (hasBefore || hasAfter) {
              throw new RequestError("Choose one valid task position.", 400);
            }
          }
          const position: TaskPosition | undefined = hasBefore
            ? { beforeId: body.beforeId as string }
            : hasAfter
              ? { afterId: body.afterId as string }
              : undefined;
          const id = decodeURIComponent(statusUpdate[1] ?? "");
          sendJson(response, await saveTaskStatus(id, status, position));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save the task status.";
          const status =
            error instanceof RequestError
              ? error.status
              : error instanceof GilasError
                ? error.code === "task-not-found"
                  ? 404
                  : error.code === "duplicate-id"
                    ? 409
                    : 400
                : 500;
          sendJson(response, { error: message }, status);
        }
      })();
      return;
    }

    if (request.method !== "GET") {
      response.setHeader("Allow", "GET, POST");
      sendJson(response, { error: "Only GET and task status updates are supported." }, 405);
      return;
    }

    if (url.pathname === "/api/board") {
      void loadBoard(filePath).then((payload) => sendJson(response, payload));
      return;
    }

    if (url.pathname === "/api/events") {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      });
      response.write("retry: 2000\n\n");
      clients.add(response);
      response.on("close", () => clients.delete(response));
      void loadBoard(filePath).then((payload) => sendEvent(response, "board", payload));
      return;
    }

    const file = STATIC_FILES.get(url.pathname);
    if (file === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    void readFile(file.path)
      .then((body) => {
        response.writeHead(200, {
          "Cache-Control": "no-cache",
          "Content-Security-Policy":
            "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'",
          "Content-Type": file.type,
          "X-Content-Type-Options": "nosniff",
        });
        response.end(body);
      })
      .catch(() => {
        response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("The Gilas web assets are not built yet. Run pnpm build in apps/web.");
      });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        stopWatching();
        for (const client of clients) client.end();
        clients.clear();
        if (!server.listening) {
          resolveClose();
          return;
        }
        server.close((error) => {
          if (error !== undefined) rejectClose(error);
          else resolveClose();
        });
      }),
  };
}
