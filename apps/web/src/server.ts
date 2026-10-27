import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { basename, dirname, join, resolve } from "node:path";
import type { ParseWarning, Task } from "@gilas/core";
import { parse } from "../../../packages/core/src/index.js";

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
const CLIENT_SCRIPT = resolve(process.cwd(), "dist/client.js");
const STATIC_FILES = new Map<string, { path: string; type: string }>([
  ["/", { path: join(PUBLIC_DIRECTORY, "index.html"), type: "text/html; charset=utf-8" }],
  ["/index.html", { path: join(PUBLIC_DIRECTORY, "index.html"), type: "text/html; charset=utf-8" }],
  ["/styles.css", { path: join(PUBLIC_DIRECTORY, "styles.css"), type: "text/css; charset=utf-8" }],
  ["/client.js", { path: CLIENT_SCRIPT, type: "text/javascript; charset=utf-8" }],
]);

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

export function createBoardServer(options: BoardServerOptions): BoardServer {
  const filePath = resolve(options.filePath);
  const clients = new Set<ServerResponse>();

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
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, { error: "Only GET requests are supported." }, 405);
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
