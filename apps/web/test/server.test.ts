import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBoard, watchTaskFile } from "../src/server.js";

const examples: string[] = [];
const stopWatchers: (() => void)[] = [];

afterEach(async () => {
  for (const stop of stopWatchers.splice(0)) stop();
  await Promise.all(examples.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeTasksFile(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "gilas-web-"));
  examples.push(directory);
  const path = join(directory, "example_tasks.md");
  await writeFile(path, content);
  return path;
}

describe("Gilas web task source", () => {
  it("loads tasks and parser warnings from the selected file", async () => {
    const path = await makeTasksFile(
      [
        "# Example",
        "| ID | Task | Priority | Status |",
        "| --- | --- | --- | --- |",
        "| G-1 | Keep the board fresh | P1 | Next up |",
        "| G-2 | Needs a recognised status | P2 | Unknown |",
        "",
      ].join("\n"),
    );

    const payload = await loadBoard(path);
    expect(payload.source).toBe("example_tasks.md");
    expect(payload.tasks).toHaveLength(2);
    expect(payload.tasks[0]).toMatchObject({ id: "G-1", status: "Next up", priority: "P1" });
    expect(payload.warnings).toEqual([
      { line: 5, code: "unknown-status", message: 'Unknown status "Unknown".' },
    ]);
  });

  it("reloads the task file after a disk change", async () => {
    const path = await makeTasksFile(
      "| ID | Task | Status |\n| --- | --- | --- |\n| G-1 | First version | Backlog |\n",
    );
    let notifyChange: (filename: string | Buffer | null) => void = () => {};
    let reloadCount = 0;
    const updated = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("The file watcher did not report an edit.")),
        3000,
      );
      const stop = watchTaskFile(
        path,
        () => {
          reloadCount += 1;
          clearTimeout(timeout);
          void loadBoard(path).then((payload) => resolve(payload.tasks[0]?.title ?? ""), reject);
        },
        reject,
        (_directory, notify) => {
          notifyChange = notify;
          return { close: () => {}, on: () => undefined };
        },
      );
      stopWatchers.push(() => {
        clearTimeout(timeout);
        stop();
      });
    });

    const content = await readFile(path, "utf8");
    await writeFile(path, content.replace("First version", "Updated from disk"));
    notifyChange("another_tasks.md");
    notifyChange("example_tasks.md");
    notifyChange("example_tasks.md");
    await expect(updated).resolves.toBe("Updated from disk");
    expect(reloadCount).toBe(1);
  }, 5000);

  it("returns a readable error when the selected file is missing", async () => {
    const path = await makeTasksFile("");
    await rm(path);

    await expect(loadBoard(path)).resolves.toMatchObject({
      source: "example_tasks.md",
      error: "Could not read example_tasks.md. Check that the file exists and is readable.",
      tasks: [],
    });
  });
});
