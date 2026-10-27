# Web board

The local web app reads one Gilas task file and streams changes into a kanban board.
Dragging a task to another status updates that task's Status cell in the selected file.

```sh
pnpm install
pnpm --filter @gilas/web dev
```

By default, the app watches `docs/tasks.md`. Pass a different file after `--`:

```sh
pnpm --filter @gilas/web dev -- /path/to/project_tasks.md
```

The app listens on `http://127.0.0.1:4173`. Set `PORT` to use another port. It stays on
localhost so the task file is not exposed to other devices on the network.

The board uses the shared core parser. It shows all recognised statuses, task labels and
parser warnings. Changes made on disk appear automatically; refresh the page only if the
browser loses its live connection. Every task can be dragged between status columns with a
mouse or touch handle, or moved with the keyboard by focusing a task, pressing Space, choosing
a status with the arrow keys, and pressing Enter.
