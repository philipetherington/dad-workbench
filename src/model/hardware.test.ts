// Pure catalog tests — no Manifold kernel needed. Every entry's declarative
// output (defaults, visual, cutters, sizes, shopping line) is checked against
// the same invariants the engine and exporters rely on.

import { describe, expect, it } from 'vitest'
import { HARDWARE, buildHardwareList, hardwareDef } from './hardware'
import type { PrimSpec } from './hardware'
import { DIM_SPECS, MAX_DIM_MM } from './types'
import type { Part, ShapeKind, UnitSystem } from './types'

const UNIT_SYSTEMS: UnitSystem[] = ['in', 'mm']

/** Every prim must be a real primitive with complete, finite geometry. */
function expectValidPrims(prims: PrimSpec[], label: string): void {
  for (const prim of prims) {
    const name = `${label} ${prim.kind}`
    // a kind the engine can build (hardware may not nest hardware)
    expect(prim.kind, name).not.toBe('hardware')
    expect(Object.keys(DIM_SPECS), name).toContain(prim.kind)
    // every dim the kind requires, present and finite
    for (const spec of DIM_SPECS[prim.kind as ShapeKind]) {
      expect(Number.isFinite(prim.dims[spec.key]), `${name}.${spec.key}`).toBe(true)
    }
    // no stray non-finite dims either
    for (const [key, v] of Object.entries(prim.dims)) {
      expect(Number.isFinite(v), `${name}.${key}`).toBe(true)
    }
    expect(prim.position, name).toHaveLength(3)
    for (const v of prim.position) expect(Number.isFinite(v), `${name} position`).toBe(true)
    if (prim.rotation) {
      expect(prim.rotation, name).toHaveLength(3)
      for (const v of prim.rotation) expect(Number.isFinite(v), `${name} rotation`).toBe(true)
    }
  }
}

describe('hardware catalog', () => {
  it('has distinct ids, all findable', () => {
    expect(new Set(HARDWARE.map((h) => h.id)).size).toBe(HARDWARE.length)
    for (const def of HARDWARE) expect(hardwareDef(def.id)).toBe(def)
  })
})

describe.each(HARDWARE)('$id', (def) => {
  it.each(UNIT_SYSTEMS)('defaults (%s) cover every param and satisfy its min', (units) => {
    const d = def.defaults(units)
    for (const spec of def.params) {
      const v = d[spec.key]
      expect(Number.isFinite(v), spec.key).toBe(true)
      expect(v, spec.key).toBeGreaterThanOrEqual(spec.min)
      expect(v, spec.key).toBeLessThanOrEqual(MAX_DIM_MM)
      if (spec.integer) expect(Math.round(v), spec.key).toBe(v)
    }
  })

  it.each(UNIT_SYSTEMS)('localSize (%s) is positive on every axis', (units) => {
    const size = def.localSize(def.defaults(units))
    expect(size).toHaveLength(3)
    for (const s of size) {
      expect(Number.isFinite(s)).toBe(true)
      expect(s).toBeGreaterThan(0)
    }
  })

  it.each(UNIT_SYSTEMS)('visual (%s) is a list of valid primitives', (units) => {
    const prims = def.visual(def.defaults(units))
    expect(prims.length).toBeGreaterThan(0)
    expectValidPrims(prims, `${def.id} visual`)
  })

  it.each(UNIT_SYSTEMS)('cutters (%s) is a list of valid primitives', (units) => {
    const prims = def.cutters(def.defaults(units))
    expect(prims.length).toBeGreaterThan(0)
    expectValidPrims(prims, `${def.id} cutters`)
  })

  it.each(UNIT_SYSTEMS)('shoppingLine (%s) is a non-empty string', (units) => {
    const line = def.shoppingLine(def.defaults(units))
    expect(typeof line).toBe('string')
    expect(line.trim().length).toBeGreaterThan(0)
  })
})

describe('buildHardwareList', () => {
  function hardwarePart(id: string, catalogId: string, dims: Record<string, number>): Part {
    return {
      id,
      name: catalogId,
      kind: 'hardware',
      role: 'hardware',
      dims,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      color: '#8d949c',
      catalogId,
    }
  }

  it('groups two identical knobs into one line with qty 2', () => {
    const knob = hardwareDef('knob')!
    const dims = knob.defaults('mm')
    const list = buildHardwareList([
      hardwarePart('a', 'knob', { ...dims }),
      hardwarePart('b', 'knob', { ...dims }),
    ])
    expect(list).toHaveLength(1)
    expect(list[0].qty).toBe(2)
    expect(list[0].line).toBe(knob.shoppingLine(dims))
  })

  it('keeps differently-sized items on separate lines and skips non-hardware', () => {
    const pull = hardwareDef('pull')!
    const board: Part = {
      id: 'w',
      name: 'Board',
      kind: 'board',
      role: 'solid',
      dims: { length: 300, width: 100, thickness: 18 },
      position: [0, 9, 0],
      rotation: [0, 0, 0],
      color: '#b8926a',
    }
    const list = buildHardwareList([
      board,
      hardwarePart('a', 'pull', { centers: 96 }),
      hardwarePart('b', 'pull', { centers: 128 }),
    ])
    expect(list).toHaveLength(2)
    for (const g of list) expect(g.qty).toBe(1)
    expect(list.map((g) => g.line)).toContain(pull.shoppingLine({ centers: 96 }))
  })
})
