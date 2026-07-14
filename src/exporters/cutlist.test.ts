import { describe, expect, it } from 'vitest'
import type { Doc, Part } from '../model/types'
import { IN } from '../model/units'
import { buildCutList, buildOtherList, cutListCSV, cutListHTML } from './cutlist'

function board(name: string, length: number, width: number, thickness: number): Part {
  return {
    id: name,
    name,
    kind: 'board',
    role: 'solid',
    dims: { length, width, thickness },
    position: [0, thickness / 2, 0],
    rotation: [0, 0, 0],
    color: '#c8a165',
  }
}

function makeDoc(): Doc {
  const t = 0.75 * IN
  const w = 10 * IN
  const shelfL = 22.5 * IN
  const sideL = 36 * IN
  const parts: Part[] = [
    board('Shelf 1', shelfL, w, t),
    board('Shelf 2', shelfL, w, t),
    board('Shelf 3', shelfL, w, t),
    board('Side 1', sideL, w, t),
    // Rotated in plan: dims entered swapped (width > length). Must still
    // group with Side 1 after normalization.
    board('Side 2', w, sideL, t),
    {
      id: 'dowel-1',
      name: 'Dowel 1',
      kind: 'cylinder',
      role: 'solid',
      dims: { diameter: 0.5 * IN, height: 6 * IN },
      position: [0, 3 * IN, 0],
      rotation: [0, 0, 0],
      color: '#c8a165',
    },
  ]
  return { version: 1, name: 'Bookshelf', units: 'in', snapStep: IN / 16, parts, glues: [] }
}

describe('buildCutList', () => {
  it('groups identical boards, normalizing swapped plan dims', () => {
    const items = buildCutList(makeDoc())
    expect(items).toHaveLength(2)

    // Same thickness: sorted by length descending, so sides come first.
    expect(items[0].name).toBe('Side')
    expect(items[0].qty).toBe(2)
    expect(items[0].length).toBeCloseTo(36 * IN, 5)
    expect(items[0].width).toBeCloseTo(10 * IN, 5)
    expect(items[0].thickness).toBeCloseTo(0.75 * IN, 5)

    expect(items[1].name).toBe('Shelf')
    expect(items[1].qty).toBe(3)
    expect(items[1].length).toBeCloseTo(22.5 * IN, 5)
  })

  it('keeps length >= width on every item', () => {
    for (const item of buildCutList(makeDoc())) {
      expect(item.length).toBeGreaterThanOrEqual(item.width)
    }
  })

  it('excludes non-boards', () => {
    const items = buildCutList(makeDoc())
    expect(items.map((i) => i.name)).not.toContain('Dowel')
  })
})

describe('buildOtherList', () => {
  it('lists the dowel so nothing is silently missing', () => {
    const others = buildOtherList(makeDoc())
    expect(others).toHaveLength(1)
    expect(others[0].name).toBe('Dowel')
    expect(others[0].qty).toBe(1)
    expect(others[0].description).toContain('1/2"')
  })
})

describe('cutListCSV', () => {
  it('has a units note, header, and one line per item', () => {
    const csv = cutListCSV(makeDoc())
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('# Units: inches (fractions)')
    expect(lines[1]).toBe('Qty,Name,Thickness,Width,Length')
    // Sides row: bare-formatted inches, no unit suffix.
    expect(lines[2]).toBe('2,Side,3/4,10,36')
    expect(lines[3]).toBe('3,Shelf,3/4,10,22 1/2')
  })

  it('quotes names containing commas', () => {
    const doc = makeDoc()
    doc.parts.push(board('Top, long 1', 40 * IN, 12 * IN, IN))
    const csv = cutListCSV(doc)
    expect(csv).toContain('"Top, long"')
  })
})

describe('cutListHTML', () => {
  it('contains the project name and the footnote', () => {
    const html = cutListHTML(makeDoc())
    expect(html).toContain('Bookshelf')
    expect(html).toContain('Lengths are finished sizes — allow extra for saw kerf and trimming.')
    expect(html).toContain('Other pieces')
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })
})
