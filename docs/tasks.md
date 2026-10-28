# Gilas

Gilas tracks itself here, in its own format. See `docs/format.md` once it exists.

## M1 · Foundations

| ID  | Task                                          | Type    | Priority | Size | Status      | Notes |
| --- | --------------------------------------------- | ------- | -------- | ---- | ----------- | ----- |
| G-1 | Repo setup, tooling, CLAUDE.md and AGENTS.md  | chore   | P1       | S    | Done        |       |
| G-2 | Write the format spec (`docs/format.md`)      | docs    | P1       | S    | Done        |       |
| G-3 | Core: parser                                  | feature | P1       | M    | Done        |       |
| G-4 | Core: writer (changes one row only)           | feature | P1       | M    | Done        |       |
| G-5 | Core: round-trip and fixture tests            | test    | P1       | M    | Done        |       |

## M2 · MCP server

| ID  | Task                                              | Type    | Priority | Size | Status  | Notes |
| --- | ------------------------------------------------- | ------- | -------- | ---- | ------- | ----- |
| G-6 | MCP server with the six tools                     | feature | P1       | L    | Done    |       |
| G-7 | Setup docs for Claude Code and Codex              | docs    | P2       | S    | Done    |       |
| G-8 | One end-to-end test from each of Claude Code and Codex | test | P2    | M    | Done    | Stdio test passes; run by hand against Claude Code and Codex |

## M3 · Web board

| ID   | Task                                               | Type    | Priority | Size | Status  | Notes |
| ---- | -------------------------------------------------- | ------- | -------- | ---- | ------- | ----- |
| G-9  | Shared board components in `packages/ui`           | feature | P2       | L    | Done    |       |
| G-10 | Web app with live file watching                    | feature | P2       | M    | Done        |       |
| G-12 | Reorder tasks within a column by drag and drop     | feature | P1       | M    | Done    | Allow drag and drop to reorder tasks within the same status column as well as move them between statuses. |
| G-13 | Show task details in a modal                       | feature | P1       | M    | Done    | Keep descriptions off cards and show task information in a reorganised, responsive modal. |
| G-14 | Size column scroll areas relative to the viewport  | feature | P1       | S    | Done    | Keep task lists within columns sized to the available viewport height. |
| G-15 | Redesign the board with themes and accent colours  | feature | P1       | L    | Done    | Added light/dark themes, five accents, a Liquid Glass render, and matching glass task cards. |
| G-16 | Add global task search                             | feature | P1       | M    | Done    | Keep search results in status columns; filter by type, priority, size and milestone. |
| G-18 | Make column widths resizable by dragging           | feature | P2       | M    | Done    | Drag or use the keyboard on each column edge; widths are saved in the browser. |
| G-17 | Use the full available page width                  | feature | P1       | S    | Backlog | Use the full viewport width instead of centring the board in a narrow container. |
| G-19 | Use a readable, less playful interface font        | feature | P2       | S    | Backlog | Replace the current font with a readable, less playful option. |
| G-20 | Add board-wide and per-column filters              | feature | P1       | M    | Backlog | Add board-wide filters by task attributes and simpler filters at the top of each column. |

## M4 · VS Code extension

| ID   | Task                                               | Type    | Priority | Size | Status  | Notes |
| ---- | -------------------------------------------------- | ------- | -------- | ---- | ------- | ----- |
| G-11 | Custom editor with toggle back to raw text         | feature | P3       | L    | Backlog |       |
