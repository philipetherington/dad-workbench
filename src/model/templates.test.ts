import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './templates'
import { DIM_SPECS, MAX_DIM_MM, worldSize } from './types'
import type { Doc, Part } from './types'
import { IN } from './units'

const TOL = 0.01

interface Aabb {
  min: [number, number, number]
  max: [number, number, number]
}

function aabb(part: Part): Aabb {
  const s = worldSize(part)
  return {
    min: [0, 1, 2].map((i) => part.position[i] - s[i] / 2) as [number, number, number],
    max: [0, 1, 2].map((i) => part.position[i] + s[i] / 2) as [number, number, number],
  }
}

/** Smallest per-axis overlap depth; > 0 on all axes means the boxes interpenetrate. */
function overlapDepth(a: Aabb, b: Aabb): number {
  let depth = Infinity
  for (const i of [0, 1, 2]) {
    const d = Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])
    depth = Math.min(depth, d)
  }
  return depth
}

/** Part names, per template, that must rest directly on the bench. */
const RESTING: Record<string, string[]> = {
  bookshelf: ['Left side', 'Right side', 'Shelf 1'],
  bracket: ['Base plate'],
  doorstop: ['Wedge'],
}

function byName(doc: Doc, name: string): Part {
  const p = doc.parts.find((q) => q.name === name)
  if (!p) throw new Error(`missing part: ${name}`)
  return p
}

describe.each(TEMPLATES)('template $id', (tpl) => {
  const doc = tpl.build()

  it('builds a valid Doc', () => {
    expect(doc.version).toBe(1)
    expect(Array.isArray(doc.glues)).toBe(true)
    expect(doc.parts.length).toBeGreaterThan(0)
    expect(tpl.name.length).toBeGreaterThan(0)
    expect(tpl.description.length).toBeGreaterThan(0)
  })

  it('has distinct ids and names', () => {
    expect(new Set(doc.parts.map((p) => p.id)).size).toBe(doc.parts.length)
    expect(new Set(doc.parts.map((p) => p.name)).size).toBe(doc.parts.length)
  })

  it('keeps every dim within spec', () => {
    for (const part of doc.parts) {
      for (const spec of DIM_SPECS[part.kind]) {
        const v = part.dims[spec.key]
        expect(v, `${part.name}.${spec.key}`).toBeGreaterThanOrEqual(spec.min)
        expect(v, `${part.name}.${spec.key}`).toBeLessThanOrEqual(MAX_DIM_MM)
      }
    }
  })

  it('contains no NaN', () => {
    for (const part of doc.parts) {
      const nums = [...part.position, ...part.rotation, ...Object.values(part.dims)]
      for (const n of nums) expect(Number.isNaN(n), part.name).toBe(false)
    }
  })

  it('rests the right parts on the bench', () => {
    for (const name of RESTING[tpl.id]) {
      const part = byName(doc, name)
      expect(Math.abs(part.position[1] - worldSize(part)[1] / 2), name).toBeLessThanOrEqual(TOL)
    }
  })

  it('has no interpenetrating solids', () => {
    const solids = doc.parts.filter((p) => p.role === 'solid')
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const depth = overlapDepth(aabb(solids[i]), aabb(solids[j]))
        expect(depth, `${solids[i].name} vs ${solids[j].name}`).toBeLessThanOrEqual(TOL)
      }
    }
  })
})

describe('bookshelf specifics', () => {
  const doc = TEMPLATES.find((t) => t.id === 'bookshelf')!.build()

  it('shelf ends are flush with the side inner faces', () => {
    const left = aabb(byName(doc, 'Left side'))
    const right = aabb(byName(doc, 'Right side'))
    for (const name of ['Shelf 1', 'Shelf 2', 'Shelf 3']) {
      const shelf = aabb(byName(doc, name))
      expect(Math.abs(shelf.min[0] - left.max[0]), name).toBeLessThanOrEqual(TOL)
      expect(Math.abs(shelf.max[0] - right.min[0]), name).toBeLessThanOrEqual(TOL)
    }
  })

  it('places shelf bottoms at the specified heights', () => {
    const bottomsIn = [0, 11.625, 23.625]
    bottomsIn.forEach((b, i) => {
      const shelf = aabb(byName(doc, `Shelf ${i + 1}`))
      expect(Math.abs(shelf.min[1] - b * IN)).toBeLessThanOrEqual(TOL)
    })
  })

  it('uses inch units', () => {
    expect(doc.units).toBe('in')
  })
})

describe('bracket specifics', () => {
  const doc = TEMPLATES.find((t) => t.id === 'bracket')!.build()

  it('uses mm units', () => {
    expect(doc.units).toBe('mm')
  })

  it('seats the upright on top of the base, flush with its back edge', () => {
    const base = aabb(byName(doc, 'Base plate'))
    const upright = aabb(byName(doc, 'Upright plate'))
    expect(Math.abs(upright.min[1] - base.max[1])).toBeLessThanOrEqual(TOL)
    expect(Math.abs(upright.max[2] - base.max[2])).toBeLessThanOrEqual(TOL)
  })

  it('braces the gusset against the base top and the upright front face', () => {
    const base = aabb(byName(doc, 'Base plate'))
    const upright = aabb(byName(doc, 'Upright plate'))
    const gusset = aabb(byName(doc, 'Gusset'))
    expect(Math.abs(gusset.min[1] - base.max[1])).toBeLessThanOrEqual(TOL)
    expect(Math.abs(gusset.max[2] - upright.min[2])).toBeLessThanOrEqual(TOL)
  })

  it('drills every hole through material', () => {
    const base = aabb(byName(doc, 'Base plate'))
    const upright = aabb(byName(doc, 'Upright plate'))
    const holes = doc.parts.filter((p) => p.role === 'hole')
    expect(holes.length).toBeGreaterThan(0)
    for (const hole of holes) {
      const target = hole.name.startsWith('Base') ? base : upright
      expect(overlapDepth(aabb(hole), target), hole.name).toBeGreaterThan(TOL)
    }
  })

  it('passes base holes fully through the base thickness', () => {
    const base = aabb(byName(doc, 'Base plate'))
    for (const hole of doc.parts.filter((p) => p.name.startsWith('Base hole'))) {
      const box = aabb(hole)
      expect(box.min[1]).toBeLessThan(base.min[1])
      expect(box.max[1]).toBeGreaterThan(base.max[1])
    }
  })

  it('passes upright holes fully through the upright thickness', () => {
    const upright = aabb(byName(doc, 'Upright plate'))
    for (const hole of doc.parts.filter((p) => p.name.startsWith('Upright hole'))) {
      const box = aabb(hole)
      expect(box.min[2]).toBeLessThan(upright.min[2])
      expect(box.max[2]).toBeGreaterThan(upright.max[2])
    }
  })
})

describe('doorstop specifics', () => {
  const doc = TEMPLATES.find((t) => t.id === 'doorstop')!.build()

  it('is a single 5 x 1.5 x 1.25 inch wedge in inch units', () => {
    expect(doc.units).toBe('in')
    expect(doc.parts).toHaveLength(1)
    const w = doc.parts[0]
    expect(w.kind).toBe('wedge')
    expect(w.dims.length).toBeCloseTo(5 * IN, 6)
    expect(w.dims.width).toBeCloseTo(1.5 * IN, 6)
    expect(w.dims.height).toBeCloseTo(1.25 * IN, 6)
  })
})
