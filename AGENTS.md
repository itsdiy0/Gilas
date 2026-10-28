# Gilas

Gilas (Persian for "cherry") is a task board whose source of truth is plain markdown. People and AI agents edit the same `*_tasks.md` files, and Gilas shows them as a kanban board. It is a personal project.

## Layout (pnpm monorepo, TypeScript throughout)

- `packages/core`: parser, writer and types for the markdown format. Pure functions, no I/O, no `node:` imports, fully unit tested. Every output uses it, so they cannot disagree about the format.
- `packages/mcp`: stdio MCP server. Tools: `list_tasks`, `get_task`, `set_status`, `add_task`, `update_notes`, `next_task`.
- `packages/ui`: shared board components (plain columns and cards, coloured by priority, with coloured labels), used by the web app and the VS Code webview.
- `apps/web`: web app that watches the file and updates live.
- `apps/vscode`: custom editor for `*_tasks.md` with a toggle back to raw text.

## File format

Markdown tables with the columns `| ID | Task | Type | Priority | Size | Status | Notes |`.

- Statuses: Backlog, Next up, In progress, Review, Done, Parked.
- `##` headings group tasks into milestones.
- IDs look like `G-12`. The prefix is read from the file, the next ID is the highest plus one, and IDs are never reused.
- Priority is P0 to P3 (High, Med and Low are accepted as aliases). Size is XS to XL. Type is free text.
- **The writer changes only the row that changed.** All other text, spacing and hand-written notes stay byte-identical. A row that overflows its column is not re-padded.
- Round trip: parse then serialise must give back the identical file.
- The full spec lives in `docs/format.md`.

## Commands

- `pnpm check` runs lint, typecheck and tests. It must pass before a slice is finished.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` run the three parts separately.

## Rules

- Plain UK English in the UI and docs.
- Build in vertical slices. Finish each with lint, typecheck and tests passing before starting the next.
- Ask before adding a dependency. Pin exact versions (no `^` or `~`) that are at least two weeks old.
- Commit in small steps with clear messages. Work on branches named `slice/NN-name` and push them to `origin` after each commit. Never push to or merge into `main`: the owner merges.
- After finishing a task, push its branch and open or update its PR, then run the web app from that branch on port 3000 and leave it running so the owner can review and merge the PR. Start it with `PORT=3000 pnpm --filter @gilas/web dev` from the repository root.
- Track this project in `docs/tasks.md`, in Gilas's own format. Update it in the same commit as the work.
- When you change the rules here, make the same change in `AGENTS.md`. `pnpm check` verifies they match.

## Build order

1. Repo setup, CLAUDE.md, AGENTS.md, docs/tasks.md, tooling.
2. `packages/core` with the parser, writer and tests.
3. `packages/mcp`, with setup instructions for Claude Code and Codex, and a test from each.
4. `packages/ui` and `apps/web`.
5. `apps/vscode`.
