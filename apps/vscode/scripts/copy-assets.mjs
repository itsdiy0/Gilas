import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");
const assets = [
  [
    resolve(appRoot, "src/webview.css"),
    resolve(appRoot, "dist/webview/apps/vscode/src/webview.css"),
  ],
  [
    resolve(repoRoot, "packages/ui/src/styles.css"),
    resolve(appRoot, "dist/webview/packages/ui/src/styles.css"),
  ],
];

for (const [source, destination] of assets) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
