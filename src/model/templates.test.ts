import { beforeAll, describe, expect, it } from 'vitest'
import { initKernel } from '../engine/kernel'
import { evaluateScene } from '../engine/evaluate'
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
  'wall-cabinet': ['Left side', 'Right side', 'Bottom'],
}

/**
 * Solid pairs allowed to interpenetrate BY DESIGN: boards seated in joinery
 * cuts (a shelf in its dados, a back in its rabbets) overlap the host board's
 * bounding box exactly where the cutter removes material.
 */
const ALLOWED_OVERLAPS: Record<string, [string, string][]> = {
  'wall-cabinet': [
    ['Fixed shelf', 'Left side'],
    ['Fixed shelf', 'Right side'],
    ['Back panel', 'Left side'],
    ['Back panel', 'Right side'],
  ],
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

  it('has no interpenetrating solids beyond designed joinery engagements', () => {
    const allowed = ALLOWED_OVERLAPS[tpl.id] ?? []
    const isAllowed = (a: Part, b: Part) =>
      allowed.some(([x, y]) => (x === a.name && y === b.name) || (x === b.name && y === a.name))
    const solids = doc.parts.filter((p) => p.role === 'solid')
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        if (isAllowed(solids[i], solids[j])) continue
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

describe('wall-cabinet specifics', () => {
  const doc = TEMPLATES.find((t) => t.id === 'wall-cabinet')!.build()
  const THICK = 0.75 * IN
  const EIGHTH3 = 0.375 * IN // 3/8"

  it('uses inch units and stays unglued', () => {
    expect(doc.units).toBe('in')
    expect(doc.glues).toHaveLength(0)
    for (const p of doc.parts) expect(p.glueId, p.name).toBeUndefined()
  })

  it('assembles the carcass flush: top and bottom between the sides', () => {
    const left = aabb(byName(doc, 'Left side'))
    const right = aabb(byName(doc, 'Right side'))
    for (const name of ['Top', 'Bottom']) {
      const b = aabb(byName(doc, name))
      expect(Math.abs(b.min[0] - left.max[0]), name).toBeLessThanOrEqual(TOL)
      expect(Math.abs(b.max[0] - right.min[0]), name).toBeLessThanOrEqual(TOL)
    }
    // top face of the Top flush with the side tops; Bottom is bench-resting
    const top = aabb(byName(doc, 'Top'))
    expect(Math.abs(top.max[1] - left.max[1])).toBeLessThanOrEqual(TOL)
    expect(Math.abs(top.max[1] - 30 * IN)).toBeLessThanOrEqual(TOL)
  })

  it('attaches every cut and hardware item to a host that exists', () => {
    const attached = doc.parts.filter((p) => p.role === 'hole' || p.role === 'hardware')
    expect(attached).toHaveLength(6) // 2 rabbets + 2 dados + 2 pin rows
    for (const p of attached) {
      expect(p.hostId, p.name).toBeTruthy()
      const host = doc.parts.find((q) => q.id === p.hostId)
      expect(host, p.name).toBeDefined()
      expect(host!.role, p.name).toBe('solid')
    }
  })

  it('hugs each 3/8 x 3/8 back rabbet against its side back inner edge', () => {
    for (const [name, hostName] of [
      ['Back rabbet left', 'Left side'],
      ['Back rabbet right', 'Right side'],
    ] as const) {
      const rabbet = byName(doc, name)
      expect(rabbet.kind).toBe('rabbet')
      expect(rabbet.role).toBe('hole')
      expect(rabbet.hostId).toBe(byName(doc, hostName).id)
      expect(rabbet.dims.width).toBeCloseTo(EIGHTH3, 6)
      expect(rabbet.dims.deep).toBeCloseTo(EIGHTH3, 6)

      const host = aabb(byName(doc, hostName))
      const box = aabb(rabbet)
      // flush with the back face, cut into the inner half of the thickness
      expect(Math.abs(box.max[2] - host.max[2]), name).toBeLessThanOrEqual(TOL)
      expect(box.min[0], name).toBeGreaterThanOrEqual(host.min[0] - TOL)
      expect(box.max[0], name).toBeLessThanOrEqual(host.max[0] + TOL)
      // the span (local X) runs the side's full height (dims.span fallback;
      // hosted evaluation stretches it +2mm on its own)
      expect(box.max[1] - box.min[1], name).toBeCloseTo(30 * IN, 4)
    }
  })

  it('cuts a 3/4 wide x 3/8 deep dado into each side at mid-height', () => {
    for (const [name, hostName] of [
      ['Shelf dado left', 'Left side'],
      ['Shelf dado right', 'Right side'],
    ] as const) {
      const dado = byName(doc, name)
      expect(dado.kind).toBe('dado')
      expect(dado.role).toBe('hole')
      expect(dado.hostId).toBe(byName(doc, hostName).id)
      expect(dado.dims.width).toBeCloseTo(THICK, 6)
      expect(dado.dims.deep).toBeCloseTo(EIGHTH3, 6)

      const host = aabb(byName(doc, hostName))
      const box = aabb(dado)
      // channel width takes the shelf thickness, centered at mid-height
      expect(Math.abs((box.min[1] + box.max[1]) / 2 - 15 * IN), name).toBeLessThanOrEqual(TOL)
      expect(box.max[1] - box.min[1], name).toBeCloseTo(THICK, 4)
      // depth stays within the side's thickness
      expect(box.min[0], name).toBeGreaterThanOrEqual(host.min[0] - TOL)
      expect(box.max[0], name).toBeLessThanOrEqual(host.max[0] + TOL)
      // the span (local X) runs across the side's width (dims.span fallback)
      expect(box.max[2] - box.min[2], name).toBeCloseTo(11.25 * IN, 4)
    }
  })

  it('seats the fixed shelf IN the dados: 3/8" into each side', () => {
    const shelf = byName(doc, 'Fixed shelf')
    // inner span + 2 x 3/8"
    expect(shelf.dims.length).toBeCloseTo(22.5 * IN + 2 * EIGHTH3, 6)
    const box = aabb(shelf)
    for (const name of ['Left side', 'Right side']) {
      const depth = overlapDepth(box, aabb(byName(doc, name)))
      expect(Math.abs(depth - EIGHTH3), `shelf vs ${name}`).toBeLessThanOrEqual(TOL)
    }
    // and it sits exactly inside the dado channels' vertical extent
    for (const name of ['Shelf dado left', 'Shelf dado right']) {
      const dado = aabb(byName(doc, name))
      expect(box.min[1], name).toBeGreaterThanOrEqual(dado.min[1] - TOL)
      expect(box.max[1], name).toBeLessThanOrEqual(dado.max[1] + TOL)
    }
  })

  it('insets the 1/4" back into the rabbets, reaching both ledges', () => {
    const back = byName(doc, 'Back panel')
    expect(back.dims.thickness).toBeCloseTo(0.25 * IN, 6)
    // ledge to ledge: inner span + 2 x 3/8"
    expect(back.dims.length).toBeCloseTo(22.5 * IN + 2 * EIGHTH3, 6)
    const box = aabb(back)
    for (const name of ['Back rabbet left', 'Back rabbet right']) {
      const rabbet = aabb(byName(doc, name))
      // the back's edge lands inside the rabbet's z pocket
      expect(box.min[2], name).toBeGreaterThanOrEqual(rabbet.min[2] - TOL)
      expect(box.max[2], name).toBeLessThanOrEqual(rabbet.max[2] + TOL)
    }
    // flush with the carcass back plane, ledges at half the side thickness
    expect(Math.abs(box.max[2] - 5.625 * IN)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(box.min[0] + 11.625 * IN)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(box.max[0] - 11.625 * IN)).toBeLessThanOrEqual(TOL)
  })

  it('mounts two 5-hole shelf-pin rows on the right side above the fixed shelf', () => {
    const right = byName(doc, 'Right side')
    const shelfTop = aabb(byName(doc, 'Fixed shelf')).max[1]
    const rows = doc.parts.filter((p) => p.catalogId === 'shelf-pin-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.kind, row.name).toBe('hardware')
      expect(row.role, row.name).toBe('hardware')
      expect(row.hostId, row.name).toBe(right.id)
      expect(row.dims.count, row.name).toBe(5)
      expect(row.dims.spacing, row.name).toBe(32)
      const box = aabb(row)
      // the row runs vertically, wholly above the fixed shelf and below the top
      expect(box.max[1] - box.min[1], row.name).toBeGreaterThan(4 * 32 - TOL)
      expect(box.min[1], row.name).toBeGreaterThan(shelfTop)
      expect(box.max[1], row.name).toBeLessThan(aabb(byName(doc, 'Top')).min[1])
    }
  })
})

describe('wall-cabinet kernel evaluation', () => {
  beforeAll(async () => {
    await initKernel()
  })

  it('evaluates clean: no error, no empty solids, no idle holes', () => {
    const doc = TEMPLATES.find((t) => t.id === 'wall-cabinet')!.build()
    const res = evaluateScene(doc)
    expect(res.error).toBeNull()
    expect(res.emptySolids).toHaveLength(0)
    expect(res.idleHoles).toHaveLength(0)
  })
})
