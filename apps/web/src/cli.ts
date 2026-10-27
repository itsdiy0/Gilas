import { resolve } from "node:path";
import { createBoardServer } from "./server.js";

const taskFile =
  process.argv.slice(2).find((argument) => argument !== "--" && !argument.startsWith("-")) ??
  process.env.GILAS_TASKS ??
  "../../docs/tasks.md";
const filePath = resolve(taskFile);
const port = Number(process.env.PORT ?? "4173");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a number between 1 and 65535.");
}

const app = createBoardServer({ filePath });
app.server.listen(port, "127.0.0.1", () => {
  console.log(`Gilas is watching ${filePath} at http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
