import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Usage: gilas-mcp [path/to/tasks.md]. Falls back to GILAS_FILE, then docs/tasks.md.
const file = resolve(process.argv[2] ?? process.env.GILAS_FILE ?? "docs/tasks.md");

// stdout carries the protocol, so anything human-readable goes to stderr.
console.error(`gilas-mcp: serving ${file}`);
await createServer({ file }).connect(new StdioServerTransport());
