/** Markdown reading helpers for Spec Kit artifacts. They read structure only: headings, sections, and pipe tables. */

export interface Heading {
  readonly level: number
  readonly line: number
  readonly text: string
}

export interface Table {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** Headings outside fenced code blocks, with their 0-based line numbers. */
export const headings = (markdown: string): readonly Heading[] => {
  const found: Heading[] = []
  let fenced = false
  markdown.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const match = fenced ? null : headingPattern.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      found.push({ level: match[1].length, line: index, text: match[2] })
    }
  })
  return found
}

/** GitHub's heading anchor: lower case, punctuation removed, spaces as hyphens. */
export const anchor = (text: string): string =>
  text.toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-")

export interface Section {
  readonly end: number
  readonly start: number
}

/** The line range of the first heading matching `title`, up to the next heading of the same or a higher level. */
export const sectionRange = (markdown: string, title: RegExp): Section | undefined => {
  const all = headings(markdown)
  const index = all.findIndex((heading) => title.test(heading.text))
  const heading = all[index]
  if (heading === undefined) return undefined
  const next = all.slice(index + 1).find((candidate) => candidate.level <= heading.level)
  return { end: next?.line ?? markdown.split("\n").length, start: heading.line }
}

/** The document with the section matching `title` removed. Returns the document unchanged when it has none. */
export const withoutSection = (markdown: string, title: RegExp): string => {
  const range = sectionRange(markdown, title)
  if (range === undefined) return markdown
  const lines = markdown.split("\n")
  return [...lines.slice(0, range.start), ...lines.slice(range.end)].join("\n")
}

/** Top-level bullet items, with indented continuation lines joined. */
export const bullets = (markdown: string): readonly string[] => {
  const items: string[] = []
  let open = false
  for (const line of markdown.split("\n")) {
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet?.[1] !== undefined) items.push(bullet[1])
    else if (open && /^\s+\S/.test(line)) items.push(`${items.pop() ?? ""} ${line.trim()}`)
    open = bullet !== null || (open && /^\s+\S/.test(line))
  }
  return items
}

/** The bullet items directly in the section matching `title`. */
export const sectionBullets = (markdown: string, title: RegExp): readonly string[] => {
  const range = sectionRange(markdown, title)
  return range === undefined ? [] : bullets(markdown.split("\n").slice(range.start + 1, range.end).join("\n"))
}

const cells = (row: string): readonly string[] =>
  row.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"))

const isDelimiter = (row: string): boolean => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(row.trim())

/** Every pipe table in the document. */
export const tables = (markdown: string): readonly Table[] => {
  const lines = markdown.split("\n")
  const found: Table[] = []
  lines.forEach((line, index) => {
    const next = lines[index + 1]
    if (!line.trim().startsWith("|") || next === undefined || !isDelimiter(next)) return
    const rows: (readonly string[])[] = []
    for (let row = index + 2; lines[row]?.trim().startsWith("|") === true; row += 1) rows.push(cells(lines[row] ?? ""))
    found.push({ header: cells(line), rows })
  })
  return found
}

/** Strips emphasis and code markers from a table cell. */
export const plain = (cell: string): string => cell.replace(/[*`]/g, "").trim()

/** Splits a cell at commas and semicolons that are not inside parentheses. */
export const topLevelItems = (cell: string): readonly string[] => {
  const items: string[] = []
  let depth = 0
  let current = ""
  for (const character of cell) {
    if (character === "(") depth += 1
    if (character === ")") depth = Math.max(0, depth - 1)
    if (depth === 0 && (character === "," || character === ";")) {
      items.push(current)
      current = ""
    } else current += character
  }
  items.push(current)
  return items.map((item) => item.trim()).filter((item) => item.length > 0)
}
