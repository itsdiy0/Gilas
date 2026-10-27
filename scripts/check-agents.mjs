import { readFileSync } from "node:fs";

const claude = readFileSync("CLAUDE.md", "utf8");
const agents = readFileSync("AGENTS.md", "utf8");

if (claude !== agents) {
  console.error("AGENTS.md must match CLAUDE.md. Copy CLAUDE.md over AGENTS.md.");
  process.exit(1);
}
