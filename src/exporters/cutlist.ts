// Cut list generator: turns the document's boards into a shopping/cutting
// list, grouped by matching stock dimensions.

import type { Doc, Part } from '../model/types'
import { formatLength, formatLengthBare } from '../model/units'

export interface CutItem {
  name: string
  qty: number
  /** mm */
  length: number
  /** mm */
  width: number
  /** mm */
  thickness: number
}

export interface OtherItem {
  name: string
  qty: number
  description: string
}

const TOL = 0.1

/** Strip a trailing " <number>" so "Shelf 2" and "Shelf 3" share a base name. */
function baseName(name: string): string {
  return name.replace(/ \d+$/, '')
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOL
}

export function buildCutList(doc: Doc): CutItem[] {
  const boards = doc.parts.filter((p) => p.kind === 'board' && p.role === 'solid')

  interface Group {
    length: number
    width: number
    thickness: number
    names: string[]
  }
  const groups: Group[] = []

  for (const part of boards) {
    // A board rotated in plan is the same stock: normalize length >= width.
    const length = Math.max(part.dims.length, part.dims.width)
    const width = Math.min(part.dims.length, part.dims.width)
    const thickness = part.dims.thickness

    const group = groups.find(
      (g) => near(g.length, length) && near(g.width, width) && near(g.thickness, thickness),
    )
    if (group) {
      group.names.push(baseName(part.name))
    } else {
      groups.push({ length, width, thickness, names: [baseName(part.name)] })
    }
  }

  // All members sharing a stripped base and the fallback both resolve to the
  // first member's stripped name.
  const items = groups.map((g) => ({
    name: g.names[0],
    qty: g.names.length,
    length: g.length,
    width: g.width,
    thickness: g.thickness,
  }))

  items.sort((a, b) => a.thickness - b.thickness || b.length - a.length)
  return items
}

/** Human-readable size summary for a non-board solid, in document units. */
function otherDescription(part: Part, doc: Doc): string {
  const d = part.dims
  const fmt = (mm: number) => formatLength(mm, doc.units)
  switch (part.kind) {
    case 'cylinder':
      return `${fmt(d.diameter)} dia × ${fmt(d.height)} long`
    case 'sphere':
      return `${fmt(d.diameter)} dia ball`
    case 'cone':
      return `${fmt(d.diameter)} to ${fmt(d.topDiameter)} dia × ${fmt(d.height)} tall`
    case 'wedge':
      return `wedge ${fmt(d.length)} × ${fmt(d.width)} × ${fmt(d.height)}`
    case 'slot':
      return `slot ${fmt(d.length)} × ${fmt(d.width)} × ${fmt(d.deep)}`
    default:
      return part.kind
  }
}

export function buildOtherList(doc: Doc): OtherItem[] {
  const others = doc.parts.filter((p) => p.kind !== 'board' && p.role === 'solid')

  const items: OtherItem[] = []
  for (const part of others) {
    const name = baseName(part.name)
    const description = otherDescription(part, doc)
    const existing = items.find((i) => i.name === name && i.description === description)
    if (existing) existing.qty += 1
    else items.push({ name, qty: 1, description })
  }
  return items
}

function csvField(value: string): string {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function cutListCSV(doc: Doc): string {
  const unitsNote =
    doc.units === 'in' ? '# Units: inches (fractions)' : '# Units: millimeters'
  const lines = [unitsNote, 'Qty,Name,Thickness,Width,Length']
  for (const item of buildCutList(doc)) {
    const f = (mm: number) => formatLengthBare(mm, doc.units)
    lines.push(
      [String(item.qty), csvField(item.name), f(item.thickness), f(item.width), f(item.length)].join(','),
    )
  }
  return lines.join('\n') + '\n'
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function cutListHTML(doc: Doc): string {
  const f = (mm: number) => formatLength(mm, doc.units)
  const boards = buildCutList(doc)
  const others = buildOtherList(doc)
  const date = new Date().toLocaleDateString()

  const boardRows = boards
    .map(
      (i) =>
        `      <tr><td class="num">${i.qty}</td><td>${escapeHTML(i.name)}</td>` +
        `<td class="num">${f(i.thickness)}</td><td class="num">${f(i.width)}</td>` +
        `<td class="num">${f(i.length)}</td></tr>`,
    )
    .join('\n')

  const otherRows = others
    .map(
      (i) =>
        `      <tr><td class="num">${i.qty}</td><td>${escapeHTML(i.name)}</td>` +
        `<td>${escapeHTML(i.description)}</td></tr>`,
    )
    .join('\n')

  const otherSection =
    others.length === 0
      ? ''
      : `
  <h2>Other pieces</h2>
  <table>
    <thead>
      <tr><th>Qty</th><th>Name</th><th>Description</th></tr>
    </thead>
    <tbody>
${otherRows}
    </tbody>
  </table>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHTML(doc.name)} — Cut List</title>
<style>
  body {
    font-family: system-ui, sans-serif;
    font-size: 18px;
    color: #000;
    background: #fff;
    max-width: 52rem;
    margin: 2rem auto;
    padding: 0 1.5rem;
  }
  h1 { font-size: 1.6em; margin-bottom: 0.1em; }
  h2 { font-size: 1.2em; margin-top: 1.6em; }
  .date { color: #444; margin-top: 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 1em;
  }
  th, td {
    border: 1px solid #000;
    padding: 0.5em 0.9em;
    text-align: left;
  }
  th { font-weight: 600; }
  td.num { text-align: right; white-space: nowrap; }
  .footnote { margin-top: 2em; font-size: 0.85em; color: #333; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
  <h1>${escapeHTML(doc.name)}</h1>
  <p class="date">Cut list — ${escapeHTML(date)}</p>
  <table>
    <thead>
      <tr><th>Qty</th><th>Name</th><th>Thickness</th><th>Width</th><th>Length</th></tr>
    </thead>
    <tbody>
${boardRows}
    </tbody>
  </table>${otherSection}
  <p class="footnote">Lengths are finished sizes — allow extra for saw kerf and trimming.</p>
</body>
</html>
`
}
