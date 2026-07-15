// Assembly builders: buildDrawer / buildDoor.
// Mostly pure assembly math (no kernel), plus ONE kernel test running the
// real Manifold WASM engine over a built drawer, same pattern as joinery.test.

import { beforeAll, describe, expect, it } from 'vitest'
import { evaluateScene } from '../engine/evaluate'
import { initKernel } from '../engine/kernel'
import { buildDoor, buildDrawer } from './builders'
import type { DoorParams, DrawerParams } from './builders'
import { dimSpecsFor, MAX_DIM_MM, rotationMatrix, spanWithHost, worldSize } from './types'
import type { Doc, Part } from './types'
import { IN } from './units'

const TOL = 0.01

// -- fixtures ---------------------------------------------------------------

const DRAWER: DrawerParams = {
  openingWidth: 18 * IN,
  openingHeight: 6 * IN,
  depth: 18 * IN,
  stock: 12.7,
  slideClearance: 6.35,
}
// Drawer box outer sizes implied by DRAWER
const W = 18 * IN - 2 * 6.35 // 444.5
const H = 6 * IN - 12.7 // 139.7
const D = 18 * IN // 457.2
const T = 12.7

const DOOR: DoorParams = {
  openingWidth: 15 * IN,
  openingHeight: 30 * IN,
  stileWidth: 2.25 * IN,
  railWidth: 2.25 * IN,
  stock: 0.75 * IN,
  overlay: 12.7,
}
// Finished door sizes implied by DOOR
const DW = 15 * IN + 2 * 12.7
const DH = 30 * IN + 2 * 12.7
const SW = 2.25 * IN
const RW = 2.25 * IN

const drawerBuilt = buildDrawer(DRAWER, 'in')
const doorBuilt = buildDoor(DOOR, 'in')

// -- helpers (same AABB math as templates.test) ------------------------------

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

/** Smallest per-axis overlap depth; > 0 on all axes means interpenetration. */
function overlapDepth(a: Aabb, b: Aabb): number {
  let depth = Infinity
  for (const i of [0, 1, 2]) {
    const d = Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])
    depth = Math.min(depth, d)
  }
  return depth
}

function byName(parts: Part[], name: string): Part {
  const p = parts.find((q) => q.name === name)
  if (!p) throw new Error(`missing part: ${name}`)
  return p
}

function solids(parts: Part[]): Part[] {
  return parts.filter((p) => p.role === 'solid')
}

// -- invariants both builders must hold ---------------------------------------

describe.each([
  { label: 'drawer', built: drawerBuilt, glueName: 'Drawer' },
  { label: 'door', built: doorBuilt, glueName: 'Door' },
])('$label invariants', ({ built, glueName }) => {
  const { parts, glue } = built

  it('has distinct ids and names', () => {
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length)
    expect(new Set(parts.map((p) => p.name)).size).toBe(parts.length)
  })

  it('every generated hostId and glueId resolves', () => {
    expect(glue.name).toBe(glueName)
    const byId = new Map(parts.map((p) => [p.id, p]))
    for (const p of parts) {
      if (p.role === 'solid') {
        expect(p.glueId, p.name).toBe(glue.id)
      } else {
        // cuts and hardware ride along via their host board instead
        const host = p.hostId ? byId.get(p.hostId) : undefined
        expect(host, `${p.name} host`).toBeDefined()
        expect(host!.role, `${p.name} host role`).toBe('solid')
      }
    }
  })

  it('keeps every dim within its spec and free of NaN', () => {
    for (const p of parts) {
      for (const spec of dimSpecsFor(p)) {
        const v = p.dims[spec.key]
        expect(v, `${p.name}.${spec.key}`).toBeGreaterThanOrEqual(spec.min)
        expect(v, `${p.name}.${spec.key}`).toBeLessThanOrEqual(MAX_DIM_MM)
      }
      for (const n of [...p.position, ...p.rotation, ...Object.values(p.dims)]) {
        expect(Number.isNaN(n), p.name).toBe(false)
      }
    }
  })

  it('rests on the bench as a coherent group (min y = 0)', () => {
    const minY = Math.min(...solids(parts).map((p) => aabb(p).min[1]))
    expect(Math.abs(minY)).toBeLessThanOrEqual(TOL)
    // and nothing solid pokes below the bench
    for (const p of solids(parts)) {
      expect(aabb(p).min[1], p.name).toBeGreaterThanOrEqual(-TOL)
    }
  })
})

// -- drawer assembly math -----------------------------------------------------

describe('buildDrawer', () => {
  const { parts } = drawerBuilt

  it('makes 5 boards, 4 grooves, and 2 slides', () => {
    expect(solids(parts)).toHaveLength(5)
    expect(parts.filter((p) => p.kind === 'groove')).toHaveLength(4)
    expect(parts.filter((p) => p.catalogId === 'drawer-slide')).toHaveLength(2)
  })

  it('outer box honors the slide clearances and vertical play', () => {
    const walls = ['Drawer front', 'Drawer back', 'Left side', 'Right side'].map((n) =>
      aabb(byName(parts, n)),
    )
    const max = (i: number) => Math.max(...walls.map((b) => b.max[i]))
    const min = (i: number) => Math.min(...walls.map((b) => b.min[i]))
    expect(max(0) - min(0)).toBeCloseTo(DRAWER.openingWidth - 2 * DRAWER.slideClearance, 4)
    expect(max(1) - min(1)).toBeCloseTo(DRAWER.openingHeight - 12.7, 4)
    expect(max(2) - min(2)).toBeCloseTo(DRAWER.depth, 4)
  })

  it('walls meet flush; no solid interpenetrates another', () => {
    const ss = solids(parts)
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        const depth = overlapDepth(aabb(ss[i]), aabb(ss[j]))
        expect(depth, `${ss[i].name} vs ${ss[j].name}`).toBeLessThanOrEqual(TOL)
      }
    }
    // sides sit exactly between front and back
    const front = aabb(byName(parts, 'Drawer front'))
    const back = aabb(byName(parts, 'Drawer back'))
    for (const name of ['Left side', 'Right side']) {
      const side = aabb(byName(parts, name))
      expect(side.min[2], name).toBeCloseTo(front.max[2], 4)
      expect(side.max[2], name).toBeCloseTo(back.min[2], 4)
    }
  })

  // The four grooves are the subtle part: the sides are rotated boards, so
  // each groove's rotation must still put its local X (the span axis) along
  // its own host's LONG axis for the host-derived span to be right.
  it('each groove runs its board\'s length, 9.5mm up, 6.35mm into the wood', () => {
    const cases = [
      // groove, host, hosted span, axis into the wood, cut range on that axis
      { g: 'Front groove', host: 'Drawer front', span: W + 2, axis: 2 as const, lo: -D / 2 + T - 6.35, hi: -D / 2 + T },
      { g: 'Back groove', host: 'Drawer back', span: W + 2, axis: 2 as const, lo: D / 2 - T, hi: D / 2 - T + 6.35 },
      { g: 'Left groove', host: 'Left side', span: D - 2 * T + 2, axis: 0 as const, lo: -W / 2 + T - 6.35, hi: -W / 2 + T },
      { g: 'Right groove', host: 'Right side', span: D - 2 * T + 2, axis: 0 as const, lo: W / 2 - T, hi: W / 2 - T + 6.35 },
    ]
    for (const c of cases) {
      const g = byName(parts, c.g)
      const host = byName(parts, c.host)
      expect(g.kind, c.g).toBe('groove')
      expect(g.role, c.g).toBe('hole')
      expect(g.hostId, c.g).toBe(host.id)
      expect(g.dims.width, c.g).toBeCloseTo(6.75, 6)
      expect(g.dims.deep, c.g).toBeCloseTo(6.35, 6)
      // host-derived span = the host's long extent + 2mm overshoot
      expect(spanWithHost(g, host), c.g).toBeCloseTo(c.span, 4)
      // centered 9.5 above the box bottom edge (which rests at y = 0)
      expect(g.position[1], c.g).toBeCloseTo(9.5, 4)
      const box = aabb(g)
      expect(box.max[1] - box.min[1], `${c.g} channel width up`).toBeCloseTo(6.75, 4)
      // the cut goes from the wall's inner face into the wood, never out of it
      expect(box.min[c.axis], `${c.g} cut start`).toBeCloseTo(c.lo, 4)
      expect(box.max[c.axis], `${c.g} cut end`).toBeCloseTo(c.hi, 4)
      const hostBox = aabb(host)
      expect(box.min[c.axis]).toBeGreaterThanOrEqual(hostBox.min[c.axis] - TOL)
      expect(box.max[c.axis]).toBeLessThanOrEqual(hostBox.max[c.axis] + TOL)
    }
  })

  it('bottom panel fits inside the groove-to-groove span, seated in the groove band', () => {
    const b = aabb(byName(parts, 'Drawer bottom'))
    // meets the walls' inner faces (the groove mouths) exactly...
    expect(b.min[0]).toBeCloseTo(-(W / 2 - T), 4)
    expect(b.max[0]).toBeCloseTo(W / 2 - T, 4)
    expect(b.min[2]).toBeCloseTo(-(D / 2 - T), 4)
    expect(b.max[2]).toBeCloseTo(D / 2 - T, 4)
    // ...and inside the groove bottoms (6.35 deep each side) with room to spare
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(W - 2 * T + 2 * 6.35 + TOL)
    expect(b.max[2] - b.min[2]).toBeLessThanOrEqual(D - 2 * T + 2 * 6.35 + TOL)
    // vertically the ply sits inside the 6.75 channel band centered 9.5 up
    expect(b.max[1] - b.min[1]).toBeCloseTo(6.35, 4)
    expect(b.min[1]).toBeGreaterThanOrEqual(9.5 - 6.75 / 2 - TOL)
    expect(b.max[1]).toBeLessThanOrEqual(9.5 + 6.75 / 2 + TOL)
  })

  it('hangs one slide on the outside of each side board, depth rounded down to 50mm', () => {
    const leftSlide = byName(parts, 'Left slide')
    const rightSlide = byName(parts, 'Right slide')
    for (const s of [leftSlide, rightSlide]) {
      expect(s.kind).toBe('hardware')
      expect(s.role).toBe('hardware')
      expect(s.catalogId).toBe('drawer-slide')
      // 18" (457.2) rounds down to the common 450 length
      expect(s.dims.length).toBe(450)
      // centered on the side's height, front edge flush with the drawer front
      expect(s.position[1]).toBeCloseTo(H / 2, 4)
      expect(s.position[2] - s.dims.length / 2).toBeCloseTo(-D / 2, 4)
    }
    // mounting plane (the part origin) on each side's OUTER face,
    // hosted by that side
    expect(leftSlide.position[0]).toBeCloseTo(-W / 2, 4)
    expect(rightSlide.position[0]).toBeCloseTo(W / 2, 4)
    expect(leftSlide.hostId).toBe(byName(parts, 'Left side').id)
    expect(rightSlide.hostId).toBe(byName(parts, 'Right side').id)
    // pilots (local -Y) bore inward: -Y -> +X on the left, -X on the right
    const RL = rotationMatrix(leftSlide.rotation)
    const RR = rotationMatrix(rightSlide.rotation)
    expect(-RL[0][1]).toBeCloseTo(1, 6)
    expect(-RR[0][1]).toBeCloseTo(-1, 6)
  })
})

// -- door assembly math --------------------------------------------------------

describe('buildDoor', () => {
  const { parts } = doorBuilt

  it('makes 5 boards, 4 grooves, and 2 hinges', () => {
    expect(solids(parts)).toHaveLength(5)
    expect(parts.filter((p) => p.kind === 'groove')).toHaveLength(4)
    expect(parts.filter((p) => p.catalogId === 'cup-hinge')).toHaveLength(2)
  })

  it('finished size = opening + overlay all around; inset = the opening exactly', () => {
    const frame = solids(parts)
    const max = (i: number) => Math.max(...frame.map((p) => aabb(p).max[i]))
    const min = (i: number) => Math.min(...frame.map((p) => aabb(p).min[i]))
    expect(max(2) - min(2)).toBeCloseTo(DW, 4) // width runs along Z
    expect(max(1) - min(1)).toBeCloseTo(DH, 4)
    expect(max(0) - min(0)).toBeCloseTo(DOOR.stock, 4) // one stock thick

    const inset = buildDoor({ ...DOOR, overlay: 0 }, 'in')
    const ib = solids(inset.parts).map((p) => aabb(p))
    const iMax = (i: number) => Math.max(...ib.map((b) => b.max[i]))
    const iMin = (i: number) => Math.min(...ib.map((b) => b.min[i]))
    expect(iMax(2) - iMin(2)).toBeCloseTo(15 * IN, 4)
    expect(iMax(1) - iMin(1)).toBeCloseTo(30 * IN, 4)
  })

  it('stiles run full height; rails fit flush between them; frame shares no space', () => {
    const ls = aabb(byName(parts, 'Left stile'))
    const rs = aabb(byName(parts, 'Right stile'))
    for (const s of [ls, rs]) {
      expect(s.min[1]).toBeCloseTo(0, 4)
      expect(s.max[1]).toBeCloseTo(DH, 4)
    }
    const br = aabb(byName(parts, 'Bottom rail'))
    const tr = aabb(byName(parts, 'Top rail'))
    for (const r of [br, tr]) {
      expect(r.min[2]).toBeCloseTo(ls.max[2], 4)
      expect(r.max[2]).toBeCloseTo(rs.min[2], 4)
    }
    expect(br.min[1]).toBeCloseTo(0, 4)
    expect(tr.max[1]).toBeCloseTo(DH, 4)
    // frame members (panel floats in grooves by design, so it is excluded)
    const frame = solids(parts).filter((p) => p.name !== 'Door panel')
    for (let i = 0; i < frame.length; i++) {
      for (let j = i + 1; j < frame.length; j++) {
        const depth = overlapDepth(aabb(frame[i]), aabb(frame[j]))
        expect(depth, `${frame[i].name} vs ${frame[j].name}`).toBeLessThanOrEqual(TOL)
      }
    }
  })

  it('grooves cut 9.5 deep along every member\'s inner edge, spans following hosts', () => {
    const railLen = DW - 2 * SW
    const cases = [
      { g: 'Left stile groove', host: 'Left stile', span: DH + 2, axis: 2 as const, lo: -DW / 2 + SW - 9.5, hi: -DW / 2 + SW },
      { g: 'Right stile groove', host: 'Right stile', span: DH + 2, axis: 2 as const, lo: DW / 2 - SW, hi: DW / 2 - SW + 9.5 },
      { g: 'Bottom rail groove', host: 'Bottom rail', span: railLen + 2, axis: 1 as const, lo: RW - 9.5, hi: RW },
      { g: 'Top rail groove', host: 'Top rail', span: railLen + 2, axis: 1 as const, lo: DH - RW, hi: DH - RW + 9.5 },
    ]
    for (const c of cases) {
      const g = byName(parts, c.g)
      const host = byName(parts, c.host)
      expect(g.hostId, c.g).toBe(host.id)
      expect(g.dims.deep, c.g).toBeCloseTo(9.5, 6)
      expect(spanWithHost(g, host), c.g).toBeCloseTo(c.span, 4)
      const box = aabb(g)
      // the 6.75 channel is centered in the door's thickness
      expect(box.max[0] - box.min[0], c.g).toBeCloseTo(6.75, 4)
      expect(g.position[0], c.g).toBeCloseTo(0, 4)
      // and cuts from the inner edge 9.5 into the member
      expect(box.min[c.axis], `${c.g} cut start`).toBeCloseTo(c.lo, 4)
      expect(box.max[c.axis], `${c.g} cut end`).toBeCloseTo(c.hi, 4)
    }
  })

  it('panel floats in the grooves, leaving the 1mm expansion gap each side', () => {
    const p = aabb(byName(parts, 'Door panel'))
    // groove bottoms sit 9.5 past each inner edge; the panel stops 1 short
    expect(p.min[2]).toBeCloseTo(-DW / 2 + SW - 9.5 + 1, 4)
    expect(p.max[2]).toBeCloseTo(DW / 2 - SW + 9.5 - 1, 4)
    expect(p.min[1]).toBeCloseTo(RW - 9.5 + 1, 4)
    expect(p.max[1]).toBeCloseTo(DH - RW + 9.5 - 1, 4)
    // 1/4" ply centered in the door's thickness
    expect(p.max[0] - p.min[0]).toBeCloseTo(6.35, 4)
    expect((p.max[0] + p.min[0]) / 2).toBeCloseTo(0, 4)
  })

  it('two cup hinges on one stile, cups 75mm from each end, bores facing in', () => {
    const stile = byName(parts, 'Left stile')
    const bottom = byName(parts, 'Bottom hinge')
    const top = byName(parts, 'Top hinge')
    expect(bottom.position[1]).toBeCloseTo(75, 4)
    expect(top.position[1]).toBeCloseTo(DH - 75, 4)
    for (const h of [bottom, top]) {
      expect(h.catalogId, h.name).toBe('cup-hinge')
      expect(h.hostId, h.name).toBe(stile.id)
      // mounted on the door's back face, over the stile's wood
      expect(h.position[0], h.name).toBeCloseTo(DOOR.stock / 2, 4)
      expect(h.position[2], h.name).toBeGreaterThanOrEqual(aabb(stile).min[2] - TOL)
      expect(h.position[2], h.name).toBeLessThanOrEqual(aabb(stile).max[2] + TOL)
      // the cup bore (local -Y) points INTO the stile: world -X
      const R = rotationMatrix(h.rotation)
      expect(-R[0][1], `${h.name} bore x`).toBeCloseTo(-1, 6)
      expect(-R[1][1], `${h.name} bore y`).toBeCloseTo(0, 6)
      expect(-R[2][1], `${h.name} bore z`).toBeCloseTo(0, 6)
    }
  })
})

// -- the one kernel test -------------------------------------------------------

describe('a built drawer under the real kernel', () => {
  beforeAll(async () => {
    await initKernel()
  })

  it('evaluates: no error, no overlapping solids, nothing emptied, every groove cuts', () => {
    const { parts, glue } = buildDrawer(DRAWER, 'in')
    const doc: Doc = {
      version: 1,
      name: 'Built drawer',
      units: 'in',
      snapStep: IN / 16,
      parts,
      glues: [glue],
    }
    const res = evaluateScene(doc)
    expect(res.error).toBeNull()
    // solids only — cutters and hardware don't count, and don't appear here
    expect(res.overlaps).toEqual([])
    expect(res.emptySolids).toEqual([])
    // idleHoles covers exactly the role-'hole' parts — the four grooves —
    // so empty means every groove is genuinely removing wood from its board
    expect(parts.filter((p) => p.role === 'hole')).toHaveLength(4)
    expect(res.idleHoles).toEqual([])
    // and every part came back as geometry
    expect(res.parts).toHaveLength(parts.length)
    for (const p of res.parts) expect(p.positions.length % 9).toBe(0)
  })
})
