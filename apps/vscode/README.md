# Gilas for VS Code

Open a file ending in _tasks.md to use the Gilas Board editor. Use the Open as Markdown button in the editor header to switch to the regular text editor. VS Code's Reopen Editor With menu can switch back to the board.

Task statuses are edited through the Gilas core writer. Only the changed Markdown row is rewritten, and you can save the file with the normal VS Code save command.

## Run from this repository

1. Install dependencies from the repository root with pnpm install.
2. Build the extension with pnpm --filter @gilas/vscode build.
3. Open the repository in VS Code and press F5 to launch the extension host with docs/tasks.md.

The editor uses the shared task cards from packages/ui and the parser and writer from packages/core.