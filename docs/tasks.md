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
| G-8 | One end-to-end test from each of Claude Code and Codex | test | P2    | M    | Review  | Stdio test passes; neither real client run yet |

## M3 · Web board

| ID   | Task                                               | Type    | Priority | Size | Status  | Notes |
| ---- | -------------------------------------------------- | ------- | -------- | ---- | ------- | ----- |
| G-9  | Shared board components in `packages/ui`           | feature | P2       | L    | Backlog |       |
| G-10 | Web app with live file watching                    | feature | P2       | M    | Backlog |       |

## M4 · VS Code extension

| ID   | Task                                               | Type    | Priority | Size | Status  | Notes |
| ---- | -------------------------------------------------- | ------- | -------- | ---- | ------- | ----- |
| G-11 | Custom editor with toggle back to raw text         | feature | P3       | L    | Backlog |       |
