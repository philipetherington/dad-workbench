// Joinery cutters: dado / groove / rabbet / tenon / edge-profile.
// Kernel tests — run the real Manifold WASM kernel under node, same pattern
// as integration.test.ts.

import { beforeAll, describe, expect, it } from 'vitest'
import { initKernel } from '../engine/kernel'
import { evaluateScene } from '../engine/evaluate'
import { exportSCAD } from '../exporters/scad'
import { deserializeDoc, serializeDoc } from './store'
import { effectiveSpan } from './types'
import type { Doc, Part } from './types'

beforeAll(async () => {
  await initKernel()
})

function mkDoc(parts: Part[]): Doc {
  return { version: 1, name: 'joinery', units: 'mm', snapStep: 1, glues: [], parts }
}

/** A board resting on the bench, centered at the origin in plan. */
function mkBoard(id: string, length: number, thickness: number, width: number): Part {
  return {
    id,
    name: id,
    kind: 'board',
    role: 'solid',
    dims: { length, thickness, width },
    position: [0, thickness / 2, 0],
    rotation: [0, 0, 0],
    color: '#c9a06a',
  }
}

function mkCutter(
  id: string,
  name: string,
  kind: Part['kind'],
  dims: Record<string, number>,
  position: [number, number, number],
  hostId?: string,
): Part {
  return {
    id,
    name,
    kind,
    role: 'hole',
    dims,
    position,
    rotation: [0, 0, 0],
    color: '#e05d5d',
    ...(hostId ? { hostId } : {}),
  }
}

/** Volume of a closed triangle soup (signed tetrahedra about the origin). */
function meshVolume(pos: Float32Array): number {
  let v = 0
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2]
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5]
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8]
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(v)
}

function solidVolume(doc: Doc, id: string): number {
  const res = evaluateScene(doc)
  expect(res.error).toBeNull()
  return meshVolume(res.parts.find((p) => p.id === id)!.positions)
}

describe('host-aware span', () => {
  it('a hosted dado spans the full board +2mm even when dims.span is tiny', () => {
    const board = mkBoard('b', 300, 18, 100)
    // channel in the top face: deep 6 -> y in [12, 18]
    const dado = mkCutter('d', 'Dado 1', 'dado', { width: 12, deep: 6, span: 5 }, [0, 15, 0], 'b')
    const doc = mkDoc([board, dado])

    expect(effectiveSpan(doc, dado)).toBeCloseTo(302, 6)

    const res = evaluateScene(doc)
    expect(res.error).toBeNull()
    expect(res.idleHoles).toHaveLength(0)
    const dp = res.parts.find((p) => p.id === 'd')!
    expect(dp.bbox.max[0] - dp.bbox.min[0]).toBeCloseTo(302, 4)
    // the board loses exactly channel width x depth x its own length
    const cut = meshVolume(res.parts.find((p) => p.id === 'b')!.positions)
    expect(cut).toBeCloseTo(300 * 18 * 100 - 12 * 6 * 300, 0)
  })

  it('the span keeps following the host when the board is resized', () => {
    const board = mkBoard('b', 300, 18, 100)
    const dado = mkCutter('d', 'Dado 1', 'dado', { width: 12, deep: 6, span: 5 }, [0, 15, 0], 'b')
    const doc = mkDoc([board, dado])
    board.dims.length = 450
    expect(effectiveSpan(doc, dado)).toBeCloseTo(452, 6)
    // unhosted, dims.span is used exactly as typed
    delete dado.hostId
    expect(effectiveSpan(doc, dado)).toBe(5)
  })
})

describe('tenon', () => {
  it('on a 19x89 board end it leaves a centered tongue of the right volume', () => {
    const board = mkBoard('b', 200, 19, 89) // x in [-100, 100], y in [0, 19]
    const tenon = mkCutter(
      't',
      'Tenon 1',
      'tenon',
      { length: 30, tongueThickness: 6, tongueWidth: 60 },
      [85, 9.5, 0], // covers the last 30mm of the board end
      'b',
    )
    const doc = mkDoc([board, tenon])
    const res = evaluateScene(doc)
    expect(res.error).toBeNull()
    expect(res.idleHoles).toHaveLength(0)

    const pos = res.parts.find((p) => p.id === 'b')!.positions
    // removed volume = (board cross-section minus tongue) x tenon length
    const removed = 200 * 19 * 89 - meshVolume(pos)
    expect(removed).toBeCloseTo((19 * 89 - 6 * 60) * 30, 0)

    // the tongue still reaches the board end, and everything on that end
    // face lies within the centered tongue rectangle
    let maxX = -Infinity
    for (let i = 0; i < pos.length; i += 3) maxX = Math.max(maxX, pos[i])
    expect(maxX).toBeCloseTo(100, 4)
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < 99.99) continue
      expect(pos[i + 1]).toBeGreaterThanOrEqual(9.5 - 3 - 1e-4)
      expect(pos[i + 1]).toBeLessThanOrEqual(9.5 + 3 + 1e-4)
      expect(pos[i + 2]).toBeGreaterThanOrEqual(-30 - 1e-4)
      expect(pos[i + 2]).toBeLessThanOrEqual(30 + 1e-4)
    }
  })
})

describe('edge profile', () => {
  // board top-front edge at y = 18, z = 50; a size-10 cutter centered so its
  // +Y +Z corner sits exactly on that edge
  const SIZE = 10
  function edgeDoc(profile: number): Doc {
    const board = mkBoard('b', 300, 18, 100)
    const ep = mkCutter(
      'e',
      'Edge Profile 1',
      'edge-profile',
      { size: SIZE, span: 300, profile },
      [0, 18 - SIZE / 2, 50 - SIZE / 2],
    )
    return mkDoc([board, ep])
  }
  const BOARD_VOL = 300 * 18 * 100

  it('roundover removes ~ (1 - pi/4) * size^2 * span of material', () => {
    const removed = BOARD_VOL - solidVolume(edgeDoc(0), 'b')
    const expected = (1 - Math.PI / 4) * SIZE * SIZE * 300
    expect(Math.abs(removed - expected)).toBeLessThan(expected * 0.02)
  })

  it('chamfer removes the corner triangle; cove removes the quarter cylinder', () => {
    const chamfer = BOARD_VOL - solidVolume(edgeDoc(1), 'b')
    expect(chamfer).toBeCloseTo((SIZE * SIZE * 300) / 2, 0)
    const cove = BOARD_VOL - solidVolume(edgeDoc(2), 'b')
    const expected = (Math.PI / 4) * SIZE * SIZE * 300
    expect(Math.abs(cove - expected)).toBeLessThan(expected * 0.02)
  })
})

describe('round-trip and OpenSCAD export', () => {
  function allCuttersDoc(): Doc {
    const board = mkBoard('b', 300, 18, 100)
    return mkDoc([
      board,
      mkCutter('d1', 'Dado 1', 'dado', { width: 12, deep: 6, span: 5 }, [0, 15, 0], 'b'),
      mkCutter('g1', 'Groove 1', 'groove', { width: 6, deep: 8, span: 80 }, [0, 14, -30]),
      mkCutter('r1', 'Rabbet 1', 'rabbet', { width: 10, deep: 9, span: 5 }, [0, 13.5, 45], 'b'),
      mkCutter(
        't1',
        'Tenon 1',
        'tenon',
        { length: 30, tongueThickness: 6, tongueWidth: 60 },
        [135, 9, 0],
        'b',
      ),
      mkCutter('e1', 'Edge Profile 1', 'edge-profile', { size: 10, span: 300, profile: 2 }, [0, 13, -45]),
    ])
  }

  it('every new kind round-trips deserializeDoc', () => {
    const doc = allCuttersDoc()
    const back = deserializeDoc(serializeDoc(doc))
    expect(back).not.toBeNull()
    for (const kind of ['dado', 'groove', 'rabbet', 'tenon', 'edge-profile'] as const) {
      const orig = doc.parts.find((p) => p.kind === kind)!
      const rt = back!.parts.find((p) => p.kind === kind)!
      expect(rt).toBeDefined()
      expect(rt.dims).toEqual(orig.dims)
      expect(rt.role).toBe('hole')
      expect(rt.hostId).toBe(orig.hostId)
    }
  })

  it('every new kind appears in exportSCAD with the right module', () => {
    const scad = exportSCAD(allCuttersDoc())
    expect(scad).toContain('module hole_dado_1')
    expect(scad).toContain('module hole_groove_1')
    expect(scad).toContain('module hole_rabbet_1')
    expect(scad).toContain('module hole_tenon_1')
    expect(scad).toContain('module hole_edge_profile_1')
    // hosted dado and rabbet emit the host-resolved span (300 + 2 overshoot)
    expect(scad).toContain('cube([302, 6, 12]')
    expect(scad).toContain('cube([302, 9, 10]')
    // unhosted groove keeps its own span
    expect(scad).toContain('cube([80, 8, 6]')
    // tenon is a difference of two cubes, body sized from the host
    const tenonMod = scad.slice(scad.indexOf('module hole_tenon_1'))
    expect(tenonMod).toContain('difference()')
    expect((tenonMod.split('\n').slice(0, 6).join('\n').match(/cube\(/g) ?? []).length).toBe(2)
    // edge profile is an extruded polygon
    const epMod = scad.slice(scad.indexOf('module hole_edge_profile_1'))
    expect(epMod).toContain('linear_extrude(height = 300')
    expect(epMod).toContain('polygon(points = [')
  })
})
