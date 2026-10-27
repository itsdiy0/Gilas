const HEADER = "| ID | Task | Type | Priority | Size | Status | Notes |";
const RULE = "| -- | ---- | ---- | -------- | ---- | ------ | ----- |";

export const fixtures: Record<string, string> = {
  empty: "",
  prose: "# Notes\n\nNothing to see here.\n",
  basic: `# Project\n\n## M1 · First\n\n${HEADER}\n${RULE}\n| G-1 | Set up | chore | P1 | S | Done | |\n| G-2 | Build it | feature | P0 | L | In progress | started Monday |\n\n## M2 · Second\n\n${HEADER}\n${RULE}\n| G-3 | Ship | feature | P2 | M | Backlog | |\n`,
  padded: `## Board\n\n| ID  | Task      | Type    | Priority | Size | Status      | Notes |\n| --- | --------- | ------- | -------- | ---- | ----------- | ----- |\n| T-1 | Short     | bug     | P3       | XS   | Review      |       |\n| T-2 | Longer one | docs   | P2       | M    | Next up     | see T-1 |\n`,
  crlf: `## A\r\n\r\n${HEADER}\r\n${RULE}\r\n| G-1 | One | bug | P1 | S | Backlog | |\r\n| G-2 | Two | bug | P2 | M | Done | |\r\n`,
  mixedEndings: `## A\n\n${HEADER}\r\n${RULE}\n| G-1 | One | bug | P1 | S | Backlog | |\r\n| G-2 | Two | bug | P2 | M | Done | |\n`,
  bom: `﻿## A\n\n${HEADER}\n${RULE}\n| G-1 | One | bug | P1 | S | Backlog | |\n`,
  noTrailingNewline: `## A\n\n${HEADER}\n${RULE}\n| G-1 | One | bug | P1 | S | Backlog | |`,
  trailingSpaces: `## A  \n\n${HEADER}  \n${RULE}\t\n| G-1 | One | bug | P1 | S | Backlog | |   \n\n\n\n| G-2 | Two | bug | P2 | M | Done | |  \n`,
  tabsAndIndent: `## A\n\n  ${HEADER}\n  ${RULE}\n\t| G-1 | One | bug | P1 | S | Backlog | |\n  | G-2 | Two | bug | P2 | M | Done | |\n`,
  noOuterPipes: "ID | Task | Status\n--- | ---- | ------\nG-1 | One | Backlog\n",
  unclosedRows: `## A\n\n${HEADER}\n${RULE}\n| G-1 | One | bug | P1 | S | Backlog\n| G-2 | Two | bug\n`,
  escapedPipes: `## A\n\n${HEADER}\n${RULE}\n| G-1 | Use a \\| b | chore | P2 | S | Backlog | run \`a | b\` first \\| then more |\n`,
  reordered:
    "## A\n\n| Status | ID | Task | Notes |\n| --- | --- | --- | --- |\n| Backlog | G-1 | One | |\n| done | G-2 | Two | n |\n",
  noOptionalColumns:
    "## A\n\n| ID | Task | Status |\n| -- | ---- | ------ |\n| G-1 | One | Backlog |\n",
  extraColumns: `## A\n\n| ID | Task | Owner | Status | Due |\n| -- | ---- | ----- | ------ | --- |\n| G-1 | One | me | Backlog | friday |\n`,
  unknownValues: `## A\n\n${HEADER}\n${RULE}\n| G-1 | One | bug | urgent | huge | Blocked | |\n| G-2 | Two | bug | High | m | in-progress | |\n`,
  noIdAndDuplicates: `## A\n\n${HEADER}\n${RULE}\n| | No id | bug | P1 | S | Backlog | |\n| G-1 | One | bug | P1 | S | Backlog | |\n| g-1 | Again | bug | P1 | S | Done | |\n`,
  multipleTables: `# Top\n\n${HEADER}\n${RULE}\n| G-1 | Before any ## | bug | P1 | S | Backlog | |\n\n## A\n\n| Name | Value |\n| ---- | ----- |\n| x | y |\n\nSome prose.\n\n${HEADER}\n${RULE}\n| G-2 | First in A | bug | P1 | S | Backlog | |\n\n### Sub\n\n${HEADER}\n${RULE}\n| G-3 | Second in A | bug | P1 | S | Backlog | |\n\n# Next top\n\n${HEADER}\n${RULE}\n| G-4 | After # | bug | P1 | S | Backlog | |\n`,
  fencesAndComments: `## A\n\n\`\`\`md\n${HEADER}\n${RULE}\n| X-1 | In a fence | bug | P1 | S | Backlog | |\n\`\`\`\n\n<!--\n${HEADER}\n${RULE}\n| X-2 | In a comment | bug | P1 | S | Backlog | |\n-->\n\n<!-- one line -->\n${HEADER}\n${RULE}\n| G-1 | Real | bug | P1 | S | Backlog | |\n`,
};
