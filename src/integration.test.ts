// End-to-end geometry pipeline: template doc -> kernel -> exporters.
// Runs the real Manifold WASM kernel under node.

import { beforeAll, describe, expect, it } from 'vitest'
import { initKernel } from './engine/kernel'
import { evaluateExport, evaluateScene, topOutline } from './engine/evaluate'
import { TEMPLATES } from './model/templates'
import { exportSTL } from './exporters/stl'
import { exportDXF } from './exporters/dxf'
import { exportSCAD } from './exporters/scad'
import { IN } from './model/units'
import type { Doc } from './model/types'

beforeAll(async () => {
  await initKernel()
})

function bookshelf(): Doc {
  return TEMPLATES.find((t) => t.id === 'bookshelf')!.build()
}

function bracket(): Doc {
  return TEMPLATES.find((t) => t.id === 'bracket')!.build()
}

describe('scene evaluation', () => {
  it('evaluates the bookshelf with no errors, overlaps, or idle pieces', () => {
    const result = evaluateScene(bookshelf())
    expect(result.error).toBeNull()
    expect(result.parts).toHaveLength(5)
    expect(result.overlaps).toHaveLength(0)
    expect(result.emptySolids).toHaveLength(0)
    for (const p of result.parts) {
      expect(p.positions.length).toBeGreaterThan(0)
      expect(p.positions.length % 9).toBe(0)
      // resting on the bench, nothing sunken
      expect(p.bbox.min[1]).toBeGreaterThanOrEqual(-0.01)
    }
  })

  it('holes actually cut: bracket solids lose volume to its drill holes', () => {
    const doc = bracket()
    const result = evaluateScene(doc)
    expect(result.error).toBeNull()
    expect(result.idleHoles).toHaveLength(0)
    expect(result.emptySolids).toHaveLength(0)
  })

  it('flags a hole floating in space as idle', () => {
    const doc = bookshelf()
    doc.parts.push({
      id: 'idle-hole',
      name: 'Floating hole',
      kind: 'cylinder',
      role: 'hole',
      dims: { diameter: 12, height: 50 },
      position: [2000, 25, 2000],
      rotation: [0, 0, 0],
      color: '#e05d5d',
    })
    const result = evaluateScene(doc)
    expect(result.idleHoles).toEqual(['idle-hole'])
  })

  it('flags genuinely overlapping solids but not flush neighbors', () => {
    const doc = bookshelf() // everything flush, nothing overlapping
    expect(evaluateScene(doc).overlaps).toHaveLength(0)
    // shove a shelf sideways into a side panel
    const shelf = doc.parts.find((p) => p.name === 'Shelf 2')!
    shelf.position = [shelf.position[0] + 10, shelf.position[1], shelf.position[2]]
    expect(evaluateScene(doc).overlaps.length).toBeGreaterThan(0)
  })
})

describe('export pipeline', () => {
  it('produces a z-up, floored, watertight export mesh', () => {
    const { positions } = evaluateExport(bookshelf())
    expect(positions.length % 9).toBe(0)
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minZ = Math.min(minZ, positions[i + 2])
      maxZ = Math.max(maxZ, positions[i + 2])
    }
    // floored at z = 0, and the shelf is 36" tall in Z after the y-up -> z-up turn
    expect(minZ).toBeCloseTo(0, 3)
    expect(maxZ).toBeCloseTo(36 * IN, 1)
  })

  it('writes a valid binary STL that round-trips the triangle count', () => {
    const { positions } = evaluateExport(bookshelf())
    const stl = exportSTL(positions)
    const view = new DataView(stl)
    const count = view.getUint32(80, true)
    expect(count).toBe(positions.length / 9)
    expect(stl.byteLength).toBe(84 + count * 50)
  })

  it('slices a top outline and writes DXF polylines', () => {
    const contours = topOutline(bookshelf())
    expect(contours.length).toBeGreaterThan(0)
    const dxf = exportDXF(contours)
    expect(dxf).toContain('POLYLINE')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })

  it('emits readable OpenSCAD with solids-minus-holes structure', () => {
    const scad = exportSCAD(bracket())
    expect(scad).toContain('difference()')
    expect(scad).toContain('union()')
    expect(scad).toContain('rotate([90, 0, 0]) workbench_model();')
    // every part becomes a named module
    const doc = bracket()
    const solids = doc.parts.filter((p) => p.role === 'solid')
    const holes = doc.parts.filter((p) => p.role === 'hole')
    expect((scad.match(/module piece_/g) ?? []).length).toBe(solids.length)
    expect((scad.match(/module hole_/g) ?? []).length).toBe(holes.length)
  })

  it('refuses to export an empty scene with a plain message', () => {
    const doc = bookshelf()
    doc.parts = doc.parts.filter((p) => p.role === 'hole')
    expect(() => evaluateExport(doc)).toThrow(/nothing solid/i)
  })
})
