// Scene evaluation: document -> solid geometry via the Manifold CSG kernel.
//
// Conventions recap (see model/types.ts):
//   - mm everywhere, world y-up, rotation Euler XYZ degrees with R = Rx·Ry·Rz.
//   - Manifold builds primitives z-up (cylinder axis +Z); we stand them up
//     into y-up at construction time so the whole scene lives in y-up.
//   - Holes cut every solid they overlap — evaluated live, per solid, so each
//     solid remains an individually selectable mesh in the viewport.
//   - Exports rotate the finished geometry back to z-up (slicers expect it).

import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Doc, Part, Role } from '../model/types'
import { edgeProfileIndex, hostOf, spanWithHost, tenonBodySize } from '../model/types'
import { hardwareDef, type PrimSpec } from '../model/hardware'
import { kernel } from './kernel'

export interface EvalPart {
  id: string
  role: Role
  /** De-indexed triangle soup (xyz per vertex, 9 floats per triangle). */
  positions: Float32Array
  /** World axis-aligned bbox of the part itself (pre-cut), for handles. */
  bbox: { min: [number, number, number]; max: [number, number, number] }
}

export interface EvalResult {
  parts: EvalPart[]
  /** Pairs of solid part ids whose material actually overlaps (real boards can't share space). */
  overlaps: [string, string][]
  /** Solid part ids entirely cut away by holes. */
  emptySolids: string[]
  /** Hole part ids that currently cut nothing. */
  idleHoles: string[]
  error: string | null
}

/** Track every Manifold we create so nothing leaks WASM memory. */
class Scratch {
  private items: Manifold[] = []
  keep<T extends Manifold>(m: T): T {
    this.items.push(m)
    return m
  }
  dispose() {
    for (const m of this.items) m.delete()
    this.items = []
  }
}

/**
 * The part's primitive in its local frame. `host` is the board a joinery
 * cutter is attached to (when it exists): hosted cutters size their span —
 * and a tenon its body — from the host at evaluation time, so the cut keeps
 * fitting when the board is resized. Unhosted cutters fall back to their dims.
 */
function buildPrimitive(
  m: ManifoldToplevel,
  part: Part,
  scratch: Scratch,
  host?: Part,
): Manifold {
  const { Manifold, CrossSection } = m
  const d = part.dims
  switch (part.kind) {
    case 'board':
      return scratch.keep(Manifold.cube([d.length, d.thickness, d.width], true))
    case 'cylinder': {
      const c = scratch.keep(Manifold.cylinder(d.height, d.diameter / 2, d.diameter / 2, 0, true))
      return scratch.keep(c.rotate([-90, 0, 0])) // stand up: +Z axis -> +Y
    }
    case 'sphere':
      return scratch.keep(Manifold.sphere(d.diameter / 2))
    case 'cone': {
      const c = scratch.keep(
        Manifold.cylinder(d.height, d.diameter / 2, d.topDiameter / 2, 0, true),
      )
      return scratch.keep(c.rotate([-90, 0, 0]))
    }
    case 'wedge': {
      // Right-triangle profile in the XY plane (tall side at -x, sloping down
      // toward +x), extruded along Z for the width, then centered.
      const l = d.length
      const h = d.height
      const profile = new CrossSection([
        [
          [-l / 2, -h / 2],
          [l / 2, -h / 2],
          [-l / 2, h / 2],
        ],
      ])
      const solid = scratch.keep(m.Manifold.extrude(profile, d.width))
      profile.delete()
      return scratch.keep(solid.translate([0, 0, -d.width / 2]))
    }
    case 'hardware': {
      const def = hardwareDef(part.catalogId)
      if (!def) return scratch.keep(m.Manifold.cube([10, 10, 10], true))
      return specsManifold(m, def.visual(part.dims), scratch)
    }
    case 'slot': {
      // Capsule: length along X, rounded ends of `width` diameter, cut `deep`.
      // Build the pill profile in XY, extrude +Z for depth, stand up so depth
      // runs along Y (profile Y becomes world Z: width across, as expected).
      const w = Math.min(d.width, d.length)
      const r = w / 2
      const straight = d.length - w
      let profile: InstanceType<typeof CrossSection>
      if (straight <= 0) {
        profile = CrossSection.circle(r)
      } else {
        const rect = CrossSection.square([straight, w], true)
        const cap = CrossSection.circle(r)
        const capL = cap.translate([-straight / 2, 0])
        const capR = cap.translate([straight / 2, 0])
        profile = CrossSection.union([rect, capL, capR])
        for (const c of [rect, cap, capL, capR]) c.delete()
      }
      // scaleTop must be the Vec2 [1, 1]: the JS binding mis-reads a scalar
      // (1 becomes [1, 0]) and tapers the far end to a knife edge
      const prism = scratch.keep(m.Manifold.extrude(profile, d.deep, 0, 0, [1, 1], true))
      profile.delete()
      return scratch.keep(prism.rotate([-90, 0, 0]))
    }
    case 'dado':
    case 'groove':
    case 'rabbet': {
      // One box: span along X (host-resolved), deep along Y, width across Z.
      // Dado and groove share geometry; the kinds differ in how their span
      // axis is meant to lie relative to the host (across vs along the board).
      const span = spanWithHost(part, host)
      return scratch.keep(Manifold.cube([span, d.deep, d.width], true))
    }
    case 'tenon': {
      // Removed material = body box minus the tongue left standing — one
      // Manifold difference. The tongue runs a hair long so no face of the
      // subtraction is coplanar with the body's ends.
      const [bodyT, bodyW] = tenonBodySize(part, host)
      const body = scratch.keep(Manifold.cube([d.length, bodyT, bodyW], true))
      const tongue = scratch.keep(
        Manifold.cube([d.length + 0.02, d.tongueThickness, d.tongueWidth], true),
      )
      return scratch.keep(Manifold.difference(body, tongue))
    }
    case 'edge-profile': {
      // What a router removes along one edge: a prism running along X whose
      // cross-section lives in the local YZ plane. We draw the profile in 2D
      // with x -> local Z and y -> local Y, extrude along +Z (centered), then
      // rotate([0,-90,0]) so the extrusion runs along X. The profiled corner
      // is the LOCAL TOP-FRONT edge: the +Y +Z corner of the size x size bbox.
      const span = spanWithHost(part, host)
      const s = d.size
      const h = s / 2
      let profile: InstanceType<typeof CrossSection>
      switch (edgeProfileIndex(d.profile)) {
        case 0: {
          // roundover: corner square minus the quarter cylinder that remains
          // (arc centered on the inner -y -z corner, radius = size)
          const sq = CrossSection.square([s, s], true)
          const circ = CrossSection.circle(s, 96)
          const disc = circ.translate([-h, -h])
          profile = CrossSection.difference(sq, disc)
          for (const c of [sq, circ, disc]) c.delete()
          break
        }
        case 1:
          // chamfer: the 45° corner triangle, face to face
          profile = new CrossSection([
            [
              [-h, h],
              [h, -h],
              [h, h],
            ],
          ])
          break
        case 2: {
          // cove IS the quarter cylinder, scooped out of the edge
          // (arc centered on the profiled corner itself, radius = size)
          const sq = CrossSection.square([s, s], true)
          const circ = CrossSection.circle(s, 96)
          const disc = circ.translate([h, h])
          profile = CrossSection.intersection(sq, disc)
          for (const c of [sq, circ, disc]) c.delete()
          break
        }
      }
      // scaleTop [1, 1] — see the slot case
      const prism = scratch.keep(m.Manifold.extrude(profile, span, 0, 0, [1, 1], true))
      profile.delete()
      return scratch.keep(prism.rotate([0, -90, 0]))
    }
  }
}

/** Rotate (Euler XYZ, R = Rx·Ry·Rz) then translate — see partManifold. */
function placed(
  mf: Manifold,
  rotation: [number, number, number],
  position: [number, number, number],
  scratch: Scratch,
): Manifold {
  const [rx, ry, rz] = rotation
  let out = mf
  if (rz !== 0) out = scratch.keep(out.rotate([0, 0, rz]))
  if (ry !== 0) out = scratch.keep(out.rotate([0, ry, 0]))
  if (rx !== 0) out = scratch.keep(out.rotate([rx, 0, 0]))
  return scratch.keep(out.translate(position))
}

/** Union a list of declarative primitive specs in the entry's local frame. */
function specsManifold(m: ManifoldToplevel, specs: PrimSpec[], scratch: Scratch): Manifold {
  const parts = specs.map((s) => {
    const prim = buildPrimitive(
      m,
      { kind: s.kind, dims: s.dims } as Part,
      scratch,
    )
    return placed(prim, s.rotation ?? [0, 0, 0], s.position, scratch)
  })
  if (parts.length === 1) return parts[0]
  return scratch.keep(m.Manifold.union(parts))
}

/**
 * The part placed in the world: rotated about its local-bbox center, then
 * translated so that center sits at part.position.
 * Chained rotates Z, then Y, then X compose to R = Rx·Ry·Rz, matching
 * three.js Euler 'XYZ' — keep these two in lockstep.
 * `host` feeds hosted joinery cutters — see buildPrimitive.
 */
function partManifold(m: ManifoldToplevel, part: Part, scratch: Scratch, host?: Part): Manifold {
  const mf = buildPrimitive(m, part, scratch, host)
  return placed(mf, part.rotation, part.position, scratch)
}

/**
 * Everything that cuts wood: hand-placed holes plus every hardware item's
 * bores (a cup hinge IS its 35mm bore), all in world space.
 */
function cutterManifolds(m: ManifoldToplevel, doc: Doc, scratch: Scratch): Manifold[] {
  const out: Manifold[] = []
  for (const p of doc.parts) {
    if (p.role === 'hole') {
      out.push(partManifold(m, p, scratch, hostOf(doc, p)))
    } else if (p.kind === 'hardware') {
      const def = hardwareDef(p.catalogId)
      if (!def) continue
      const local = specsManifold(m, def.cutters(p.dims), scratch)
      out.push(placed(local, p.rotation, p.position, scratch))
    }
  }
  return out
}

function toPositions(mf: Manifold): Float32Array {
  const mesh = mf.getMesh()
  const np = mesh.numProp
  const tv = mesh.triVerts
  const vp = mesh.vertProperties
  const out = new Float32Array(tv.length * 3)
  for (let i = 0; i < tv.length; i++) {
    const vi = tv[i] * np
    out[i * 3] = vp[vi]
    out[i * 3 + 1] = vp[vi + 1]
    out[i * 3 + 2] = vp[vi + 2]
  }
  return out
}

function toBBox(mf: Manifold): EvalPart['bbox'] {
  const b = mf.boundingBox()
  return { min: [...b.min] as [number, number, number], max: [...b.max] as [number, number, number] }
}

/**
 * Evaluate the whole scene for the viewport: each solid minus all holes,
 * plus each hole's own (uncut) shape so it can render as a ghost.
 */
function bboxesOverlap(a: EvalPart['bbox'], b: EvalPart['bbox'], eps = 0.05): boolean {
  return [0, 1, 2].every((i) => a.min[i] + eps < b.max[i] && b.min[i] + eps < a.max[i])
}

export function evaluateScene(doc: Doc): EvalResult {
  const m = kernel()
  const scratch = new Scratch()
  const parts: EvalPart[] = []
  const overlaps: [string, string][] = []
  const emptySolids: string[] = []
  const idleHoles: string[] = []
  try {
    const cutters = cutterManifolds(m, doc, scratch)
    const holesUnion =
      cutters.length === 0
        ? null
        : cutters.length === 1
          ? cutters[0]
          : scratch.keep(m.Manifold.union(cutters))

    const solidRecords: { id: string; mf: Manifold; bbox: EvalPart['bbox']; cutVolume: number }[] = []

    for (const part of doc.parts) {
      const raw = partManifold(m, part, scratch, hostOf(doc, part))
      const bbox = toBBox(raw)
      let result = raw
      if (part.role === 'solid' && holesUnion) {
        result = scratch.keep(m.Manifold.difference(raw, holesUnion))
        if (result.isEmpty()) emptySolids.push(part.id)
      }
      if (part.role === 'solid') {
        solidRecords.push({ id: part.id, mf: raw, bbox, cutVolume: result.volume() })
      }
      parts.push({ id: part.id, role: part.role, positions: toPositions(result), bbox })
    }

    // A hole is idle when it removes no material from any solid.
    const holes = doc.parts.filter((p) => p.role === 'hole')
    for (const hole of holes) {
      const hMf = partManifold(m, hole, scratch, hostOf(doc, hole))
      const hb = toBBox(hMf)
      let cuts = false
      for (const s of solidRecords) {
        if (!bboxesOverlap(hb, s.bbox)) continue
        const inter = scratch.keep(m.Manifold.intersection(s.mf, hMf))
        if (inter.volume() > 1) {
          cuts = true
          break
        }
      }
      if (!cuts) idleHoles.push(hole.id)
    }

    // Overlap guard: two solids whose material genuinely intersects.
    for (let i = 0; i < solidRecords.length; i++) {
      for (let j = i + 1; j < solidRecords.length; j++) {
        const a = solidRecords[i]
        const b = solidRecords[j]
        if (!bboxesOverlap(a.bbox, b.bbox)) continue
        const inter = scratch.keep(m.Manifold.intersection(a.mf, b.mf))
        if (inter.volume() > 1) overlaps.push([a.id, b.id])
      }
    }

    return { parts, overlaps, emptySolids, idleHoles, error: null }
  } catch (e) {
    return {
      parts,
      overlaps,
      emptySolids,
      idleHoles,
      error: e instanceof Error ? e.message : String(e),
    }
  } finally {
    scratch.dispose()
  }
}

/**
 * Evaluate for export: union of all solids minus all holes, as one body,
 * rotated to z-up and floored at z = 0. Throws with a plain message if the
 * scene has no solid geometry.
 */
export function evaluateExport(doc: Doc): { positions: Float32Array } {
  const m = kernel()
  const scratch = new Scratch()
  try {
    const combined = combinedManifold(m, doc, scratch)
    const zUp = scratch.keep(combined.rotate([90, 0, 0]))
    const floor = zUp.boundingBox().min[2]
    const final = scratch.keep(zUp.translate([0, 0, -floor]))
    if (final.status() !== 'NoError') {
      throw new Error(`Geometry problem: ${final.status()}`)
    }
    return { positions: toPositions(final) }
  } finally {
    scratch.dispose()
  }
}

function combinedManifold(m: ManifoldToplevel, doc: Doc, scratch: Scratch): Manifold {
  // hardware visuals never union into the wood — they're bought, not made;
  // their BORES cut like any hole (via cutterManifolds)
  const solids = doc.parts.filter((p) => p.role === 'solid')
  if (solids.length === 0) throw new Error('There is nothing solid to export yet.')
  const solidMfs = solids.map((p) => partManifold(m, p, scratch))
  let combined =
    solidMfs.length === 1 ? solidMfs[0] : scratch.keep(m.Manifold.union(solidMfs))
  const cutters = cutterManifolds(m, doc, scratch)
  if (cutters.length > 0) {
    const holesUnion =
      cutters.length === 1 ? cutters[0] : scratch.keep(m.Manifold.union(cutters))
    combined = scratch.keep(m.Manifold.difference(combined, holesUnion))
  }
  if (combined.isEmpty()) throw new Error('The holes cut away everything — nothing left to export.')
  return combined
}

/**
 * Top-down outline for DXF: slice the part (or the whole project) at
 * mid-height, viewed from above. Returns contours as [x, y] mm point lists;
 * outer boundaries wind counterclockwise, holes clockwise.
 */
export function topOutline(doc: Doc, partId?: string): [number, number][][] {
  const m = kernel()
  const scratch = new Scratch()
  try {
    let body: Manifold
    if (partId) {
      const part = doc.parts.find((p) => p.id === partId)
      if (!part) throw new Error('Part not found')
      const raw = partManifold(m, part, scratch, hostOf(doc, part))
      const cutters = part.role === 'solid' ? cutterManifolds(m, doc, scratch) : []
      if (cutters.length > 0) {
        const holesUnion =
          cutters.length === 1 ? cutters[0] : scratch.keep(m.Manifold.union(cutters))
        body = scratch.keep(m.Manifold.difference(raw, holesUnion))
      } else {
        body = raw
      }
    } else {
      body = combinedManifold(m, doc, scratch)
    }
    const zUp = scratch.keep(body.rotate([90, 0, 0]))
    // True top-down silhouette. A mid-height slice gets sloped shapes (wedges,
    // cones) and shallow recesses wrong; project() is the shape a shop cuts.
    const cross = zUp.project()
    const polys = cross.toPolygons() as [number, number][][]
    cross.delete()
    return polys.map((poly) => poly.map((pt) => [pt[0], pt[1]] as [number, number]))
  } finally {
    scratch.dispose()
  }
}
