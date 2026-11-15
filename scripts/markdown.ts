/** Markdown writing helpers for text the tooling generates from notes: quickstart results and note comments. */

/** A table cell: pipes escaped and line breaks collapsed, so the value cannot end the cell or the row. */
export const cell = (value: string): string => value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")

/** A pipe table padded the way dprint formats it. */
export const table = (header: readonly string[], rows: readonly (readonly string[])[]): string => {
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map((row) => (row[index] ?? "").length)))
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((value, index) => value.padEnd(widths[index] ?? 0)).join(" | ")} |`
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n")
}
