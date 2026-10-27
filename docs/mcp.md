# Gilas MCP server

The MCP server lets an AI agent read and edit a Gilas task file. It talks over stdio and works on one file, so the agent and the board always see the same tasks.

## Tools

| Tool           | What it does                                                                        |
| -------------- | ----------------------------------------------------------------------------------- |
| `list_tasks`   | Lists tasks. Optional filters: `status`, `section` (milestone) and `priority`.      |
| `get_task`     | Returns one task by ID, for example `G-12`.                                         |
| `set_status`   | Moves a task to a new status.                                                       |
| `add_task`     | Adds a task at the end of a milestone (default: the last table) and returns its ID. |
| `update_notes` | Replaces a task's notes, or adds to them with `append`.                             |
| `next_task`    | Picks the best task to work on. See "Choosing the next task" in `format.md`.        |

Every edit changes only the row it names. Everything else in the file stays byte-identical. Errors, such as an unknown ID or status, are returned to the agent and nothing is written.

## Build

The server is bundled into one file, so it runs from any directory.

```bash
pnpm install
pnpm --filter @gilas/mcp build
```

This writes `packages/mcp/dist/gilas-mcp.js`. Rebuild after pulling changes to `packages/core` or `packages/mcp`.

## Which file it serves

The server reads the path from its first argument, then from the `GILAS_FILE` environment variable, then falls back to `docs/tasks.md` relative to where it starts. Use an absolute path in the settings below.

## Claude Code

Add it for one project, which writes `.mcp.json` in that project:

```bash
claude mcp add --scope project gilas -- node /path/to/Gilas/packages/mcp/dist/gilas-mcp.js /path/to/project/docs/tasks.md
```

Use `--scope user` to make it available everywhere, then check it with `claude mcp list`. Inside Claude Code, the tools appear as `mcp__gilas__list_tasks` and so on.

## Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.gilas]
command = "node"
args = ["/path/to/Gilas/packages/mcp/dist/gilas-mcp.js", "/path/to/project/docs/tasks.md"]
```

Restart Codex, then run `/mcp` to see that `gilas` is connected.

## Trying it

Ask the agent: "Use gilas to show me the next task." It should call `next_task` and name the task. Then ask it to move that task to In progress and look at the file: only that row's Status cell should have changed.

## Tests

`packages/mcp/test/server.test.ts` covers every tool through an MCP client. `packages/mcp/test/stdio.test.ts` bundles the server, starts it as a child process and drives it over stdio, which is how both Claude Code and Codex launch it.
