/** A table row split into its pieces so that unchanged cells can be written back untouched. */
export interface RowParts {
  indent: string;
  /** Raw text between pipes, padding included. */
  segs: string[];
  /** Whether the row ends with a closing pipe. */
  closed: boolean;
  /** Whitespace after the closing pipe. */
  tail: string;
}

/** Returns undefined unless the line starts with a pipe (after any indent). */
export function splitRow(text: string): RowParts | undefined {
  const indent = text.slice(0, text.length - text.trimStart().length);
  if (text[indent.length] !== "|") return undefined;

  const segs: string[] = [];
  let cell = "";
  let i = indent.length + 1;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === "\\" && text[i + 1] === "|") {
      cell += "\\|";
      i += 2;
    } else if (ch === "`" && text.indexOf("`", i + 1) !== -1) {
      const close = text.indexOf("`", i + 1);
      cell += text.slice(i, close + 1);
      i = close + 1;
    } else if (ch === "|") {
      segs.push(cell);
      cell = "";
      i++;
    } else {
      cell += ch;
      i++;
    }
  }
  if (cell.trim() === "" && segs.length > 0) return { indent, segs, closed: true, tail: cell };
  segs.push(cell);
  return { indent, segs, closed: false, tail: "" };
}

export function joinRow(row: RowParts): string {
  return `${row.indent}|${row.segs.join("|")}${row.closed ? `|${row.tail}` : ""}`;
}

export const isSeparatorRow = (row: RowParts): boolean =>
  row.segs.every((seg) => /^\s*:?-+:?\s*$/.test(seg));

export const decodeCell = (seg: string): string => seg.trim().replace(/\\\|/g, "|");

export function encodeCell(value: string): string {
  const flat = value.trim().replace(/\r?\n/g, "<br>");
  let out = "";
  let i = 0;
  while (i < flat.length) {
    const ch = flat[i] as string;
    const close = ch === "`" ? flat.indexOf("`", i + 1) : -1;
    if (close !== -1) {
      out += flat.slice(i, close + 1);
      i = close + 1;
    } else {
      out += ch === "|" ? "\\|" : ch;
      i++;
    }
  }
  return out;
}

/**
 * Returns the row with one cell replaced. The new text is padded to the old cell's width,
 * never wider, so neighbouring cells keep their exact spacing.
 */
export function withCell(row: RowParts, index: number, value: string): RowParts {
  const segs = [...row.segs];
  while (segs.length <= index) segs.push(" ");
  const old = segs[index] as string;
  segs[index] = ` ${encodeCell(value)} `.padEnd(old.length);
  return { ...row, segs };
}
