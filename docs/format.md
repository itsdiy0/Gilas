# Gilas task file format

A Gilas file is an ordinary markdown file, normally named `*_tasks.md` (or `docs/tasks.md`). Anything that is not a task table is left alone: prose, headings, comments, code blocks and other tables.

## Task tables

A task table is a markdown table whose header row has at least the columns **ID**, **Task** and **Status**. The full header is:

```markdown
| ID  | Task                 | Type    | Priority | Size | Status      | Notes |
| --- | -------------------- | ------- | -------- | ---- | ----------- | ----- |
| G-1 | Write the thing      | feature | P1       | M    | In progress |       |
```

- Column names are matched ignoring case. `Title` is accepted for `Task`, and `Note` for `Notes`.
- Columns may appear in any order. `Type`, `Priority`, `Size` and `Notes` are optional.
- Extra columns are kept and ignored.
- A table without ID, Task and Status columns is not a task table and is never touched.
- A file may contain any number of task tables.
- A table ends at the first line that does not start with `|`.
- Rows with no ID are skipped with a warning.
- Pipes inside a cell must be written `\|`, or sit inside a backtick code span, where they need no escape. A backtick only opens a code span if a closing backtick follows on the same line.
- A cell cannot contain a line break. The writer turns line breaks into `<br>`.

Lines inside fenced code blocks (``` or ~~~) and HTML comments (`<!-- ... -->`) are never read as tables or headings.

## Values

| Column   | Accepted values                                                                  | Written as             |
| -------- | -------------------------------------------------------------------------------- | ---------------------- |
| ID       | `PREFIX-number`, for example `G-12`                                              | as given               |
| Status   | Backlog, Next up, In progress, Review, Done, Parked                              | exactly as listed      |
| Priority | P0 (critical), P1, P2, P3. Also `Critical`, `High` (P1), `Medium` or `Med` (P2), `Low` (P3) | `P0` to `P3`           |
| Size     | XS, S, M, L, XL                                                                  | upper case             |
| Type     | any text; feature, bug, chore, docs, test and spike are the usual ones           | as given               |
| Notes    | any text                                                                         | as given               |

- Reading ignores case, repeated spaces, hyphens and underscores, so `in-progress` and `IN PROGRESS` both mean In progress.
- A value that is not recognised (for example the status `Blocked`) is reported as a warning. The task is still listed with that field unset, and the original text stays in the file untouched.
- The writer always writes the canonical form, but only for a cell it changes.

## IDs

- The prefix is read from the file: the most common one wins.
- The next ID is the highest number with that prefix plus one. If the highest ID has leading zeros (`T-012`), the new one is padded to the same width.
- IDs are never reused while the file lists them. Delete a task by setting it to Parked or Done, not by removing the row, if you need its ID kept safe.
- IDs are matched ignoring case. A duplicate ID is reported as a warning, and the writer refuses to edit it until the duplicate is fixed.

## Milestones

A `##` heading starts a milestone. Every task table after it belongs to that milestone until the next `##` heading. A `#` heading ends the current milestone. `###` and deeper headings do not change it. Tasks before any `##` heading have no milestone.

## What the writer changes

The writer is a set of pure functions from one file's text to new text. It follows these rules.

1. **Only the changed row is rewritten.** Every other line is byte-identical, including line endings, a byte order mark, trailing spaces, blank lines and hand-written notes.
2. **Only the changed cells in that row are rewritten.** Other cells keep their exact spacing.
3. **No re-padding.** A new value is padded to the width of the cell it replaces. If it is longer, the cell grows and the table is left misaligned, which renders the same in markdown.
4. **A cell that already means the new value is not touched.** Setting P1 on a cell that says `high`, or Done on one that says `done`, changes nothing. If no cell would change, the text is returned as it was.
5. **New rows go at the end of a table.** They copy the header's indent and column widths and use the file's line ending. If the table's last line had no line ending (the file ends without a newline), that line gains one.
6. **The writer never adds columns.** Changing a field the table has no column for is an error.
7. **Unknown or duplicate IDs are errors.** Nothing is written.

Parsing and then writing without changes always gives back the identical file.

## Choosing the next task

`next_task` picks the best task from Next up, then from Backlog. Within a status, the highest priority wins (P0 first, no priority last), then whichever comes first in the file. Tasks in any other status are never chosen.
