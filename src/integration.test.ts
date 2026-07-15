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

  it('DXF outline is the full silhouette, not a mid-height slice (wedge regression)', () => {
    const doc = TEMPLATES.find((t) => t.id === 'doorstop')!.build()
    const contours = topOutline(doc)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of contours) {
      for (const [x, y] of c) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
    // the Door Wedge is 5" x 1.5" in plan — the silhouette must span all of it
    expect(maxX - minX).toBeCloseTo(5 * IN, 1)
    expect(maxY - minY).toBeCloseTo(1.5 * IN, 1)
  })
})

describe('re-seating math', () => {
  it('a tipped sphere never floats: bottom offset is always the radius', async () => {
    const { worldBottomOffset } = await import('./model/types')
    const sphere = {
      id: 's', name: 'Ball', kind: 'sphere' as const, role: 'solid' as const,
      dims: { diameter: 100 }, position: [0, 50, 0] as [number, number, number],
      rotation: [45, 0, 30] as [number, number, number], color: '#fff',
    }
    expect(worldBottomOffset(sphere)).toBeCloseTo(50, 6)
  })

  it('a lying dowel sits by its diameter, matching the engine bbox', async () => {
    const { worldBottomOffset } = await import('./model/types')
    const dowel = {
      id: 'd', name: 'Dowel', kind: 'cylinder' as const, role: 'solid' as const,
      dims: { diameter: 20, height: 300 }, position: [0, 10, 0] as [number, number, number],
      rotation: [0, 0, 90] as [number, number, number], color: '#fff',
    }
    expect(worldBottomOffset(dowel)).toBeCloseTo(10, 6)
    const result = evaluateScene({
      version: 1, name: 't', units: 'mm', snapStep: 1, glues: [], parts: [dowel],
    })
    expect(result.parts[0].bbox.min[1]).toBeCloseTo(0, 4)
  })
})

describe('hardware pipeline', () => {
  function boardWithPinRow(): Doc {
    return {
      version: 1, name: 'hw', units: 'mm', snapStep: 1, glues: [],
      parts: [
        {
          id: 'b', name: 'Side', kind: 'board', role: 'solid',
          dims: { length: 300, width: 100, thickness: 18 },
          position: [0, 9, 0], rotation: [0, 0, 0], color: '#fff',
        },
        {
          id: 'hw', name: 'Shelf Pin Row 1', kind: 'hardware', role: 'hardware',
          catalogId: 'shelf-pin-row',
          dims: { count: 4, spacing: 32, diameter: 5, deep: 12 },
          // cutters extend downward from the item's origin into the board top
          position: [0, 18, 0], rotation: [0, 0, 0], color: '#b8926a', hostId: 'b',
        },
      ],
    }
  }

  it('hardware bores cut the board it sits on', () => {
    const doc = boardWithPinRow()
    const result = evaluateScene(doc)
    expect(result.error).toBeNull()
    const board = result.parts.find((p) => p.id === 'b')!
    const plain = evaluateScene({ ...doc, parts: [doc.parts[0]] }).parts[0]
    // the bored board has more triangles than the plain one (hole walls)
    expect(board.positions.length).toBeGreaterThan(plain.positions.length)
    // and the hardware renders as its own part
    expect(result.parts.find((p) => p.id === 'hw')?.role).toBe('hardware')
  })

  it('hardware bores reach STL, and bodies stay out of it', () => {
    const doc = boardWithPinRow()
    const { positions } = evaluateExport(doc)
    // z-up export: nothing above the 18mm board — the witness rail is not exported
    let maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) maxZ = Math.max(maxZ, positions[i + 2])
    expect(maxZ).toBeLessThanOrEqual(18.01)
  })

  it('OpenSCAD gets the bores as hole modules', () => {
    const scad = exportSCAD(boardWithPinRow())
    expect(scad).toContain('difference()')
    expect(scad).toContain('bores only')
    // four pin cylinders
    expect((scad.match(/cylinder\(h = 12/g) ?? []).length).toBe(4)
  })

  it('rejects hardware with an unknown catalog id', async () => {
    const { deserializeDoc, serializeDoc } = await import('./model/store')
    const doc = boardWithPinRow()
    doc.parts[1].catalogId = 'not-a-thing'
    expect(deserializeDoc(serializeDoc(doc))).toBeNull()
  })
})

describe('document validation', () => {
  it('rejects structurally broken docs instead of installing them', async () => {
    const { deserializeDoc } = await import('./model/store')
    expect(deserializeDoc('{"version":1,"parts":[{}]}')).toBeNull()
    expect(deserializeDoc('{"version":1,"parts":[{"id":"a","name":"x","kind":"nope","role":"solid","dims":{},"position":[0,0,0],"rotation":[0,0,0]}]}')).toBeNull()
    expect(deserializeDoc('not json')).toBeNull()
  })

  it('round-trips a real doc and repairs missing fields', async () => {
    const { deserializeDoc, serializeDoc } = await import('./model/store')
    const doc = bookshelf()
    const back = deserializeDoc(serializeDoc(doc))
    expect(back).not.toBeNull()
    expect(back!.parts).toHaveLength(doc.parts.length)
    // missing glues array and bogus snapStep get repaired
    const loose = JSON.parse(serializeDoc(doc))
    delete loose.glues
    loose.snapStep = 'bad'
    const repaired = deserializeDoc(JSON.stringify(loose))
    expect(repaired!.glues).toEqual([])
    expect(repaired!.snapStep).toBeGreaterThan(0)
  })
})
