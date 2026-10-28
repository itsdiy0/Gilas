import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import * as vscode from "vscode";
import { parse } from "../../../packages/core/src/index.js";
import { readTaskBoard, updateTaskBoardStatus } from "./document.js";

const VIEW_TYPE = "gilas.taskBoard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The task could not be updated.";
}

function editorHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(18).toString("base64");
  const stylesUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "packages", "ui", "src", "styles.css"),
  );
  const editorStylesUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "apps", "vscode", "src", "webview.css"),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "apps", "vscode", "src", "webview.js"),
  );
  const csp =
    "default-src 'none'; img-src " +
    webview.cspSource +
    " data:; style-src " +
    webview.cspSource +
    "; script-src 'nonce-" +
    nonce +
    "' " +
    webview.cspSource +
    ";";

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta http-equiv="Content-Security-Policy" content="' + csp + '">',
    "<title>Gilas Board</title>",
    '<link rel="stylesheet" href="' + stylesUri + '">',
    '<link rel="stylesheet" href="' + editorStylesUri + '">',
    "</head>",
    "<body>",
    '<header class="editor-header">',
    '<div><p class="editor-eyebrow">Gilas task board</p><h1 id="file-name">Loading tasks...</h1></div>',
    '<button class="raw-toggle" id="open-raw" type="button">Open as Markdown</button>',
    "</header>",
    '<p class="editor-intro">Edit task statuses here. The Markdown file remains the source of truth.</p>',
    '<p class="editor-message" id="editor-message" role="status" aria-live="polite"></p>',
    '<section class="editor-warnings" id="warnings" aria-label="Markdown warnings" hidden>',
    "<h2>Check this task file</h2>",
    '<ul id="warning-list"></ul>',
    "</section>",
    '<main class="board" id="board" aria-label="Tasks by status"></main>',
    '<script type="module" nonce="' + nonce + '" src="' + scriptUri + '"></script>',
    "</body>",
    "</html>",
  ].join("");
}

class GilasTaskBoardProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview")],
    };
    panel.webview.html = editorHtml(panel.webview, this.context.extensionUri);

    let isReady = false;
    const sendBoard = () => {
      if (!isReady) return;
      const snapshot = readTaskBoard(document.getText());
      void panel.webview.postMessage({
        type: "board",
        fileName: basename(document.fileName),
        tasks: snapshot.tasks,
        warnings: snapshot.warnings,
      });
    };

    const messageSubscription = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isRecord(message) || typeof message.type !== "string") return;

      if (message.type === "ready") {
        isReady = true;
        sendBoard();
        return;
      }

      if (message.type === "openRawText") {
        const textDocument = await vscode.workspace.openTextDocument(document.uri);
        await vscode.window.showTextDocument(textDocument, {
          preview: false,
          viewColumn: vscode.ViewColumn.Active,
        });
        return;
      }

      if (
        message.type !== "setStatus" ||
        typeof message.id !== "string" ||
        typeof message.status !== "string"
      ) {
        return;
      }

      try {
        const taskId = message.id;
        const status = message.status;
        const source = document.getText();
        const current = parse(source);
        const task = current.tasks.find((item) => item.id.toLowerCase() === taskId.toLowerCase());
        if (task === undefined) {
          throw new Error("That task is no longer in this file. Refresh the board and try again.");
        }

        const updated = updateTaskBoardStatus(source, taskId, status);
        if (updated === source) return;

        const changedLine = parse(updated).lines[task.line - 1];
        if (changedLine === undefined) throw new Error("Could not locate the updated task row.");

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, document.lineAt(task.line - 1).range, changedLine.text);
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) throw new Error("VS Code could not apply the task update.");
      } catch (error) {
        void panel.webview.postMessage({ type: "error", message: errorText(error) });
      }
    });

    const documentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) sendBoard();
    });
    panel.onDidDispose(() => {
      messageSubscription.dispose();
      documentSubscription.dispose();
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new GilasTaskBoardProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: false },
      supportsMultipleEditorsPerDocument: true,
    }),
  );
}

export function deactivate(): void {}
