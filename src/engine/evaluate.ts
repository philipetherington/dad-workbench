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

function buildPrimitive(m: ManifoldToplevel, part: Part, scratch: Scratch): Manifold {
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
      const prism = scratch.keep(m.Manifold.extrude(profile, d.deep, 0, 0, 1, true))
      profile.delete()
      return scratch.keep(prism.rotate([-90, 0, 0]))
    }
  }
}

/**
 * The part placed in the world: rotated about its local-bbox center, then
 * translated so that center sits at part.position.
 * Chained rotates Z, then Y, then X compose to R = Rx·Ry·Rz, matching
 * three.js Euler 'XYZ' — keep these two in lockstep.
 */
function partManifold(m: ManifoldToplevel, part: Part, scratch: Scratch): Manifold {
  let mf = buildPrimitive(m, part, scratch)
  const [rx, ry, rz] = part.rotation
  if (rz !== 0) mf = scratch.keep(mf.rotate([0, 0, rz]))
  if (ry !== 0) mf = scratch.keep(mf.rotate([0, ry, 0]))
  if (rx !== 0) mf = scratch.keep(mf.rotate([rx, 0, 0]))
  return scratch.keep(mf.translate(part.position))
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
    const holes = doc.parts.filter((p) => p.role === 'hole')
    const holeMfs = holes.map((p) => partManifold(m, p, scratch))
    const holesUnion =
      holeMfs.length === 0
        ? null
        : holeMfs.length === 1
          ? holeMfs[0]
          : scratch.keep(m.Manifold.union(holeMfs))

    const solidRecords: { id: string; mf: Manifold; bbox: EvalPart['bbox']; cutVolume: number }[] = []

    for (const part of doc.parts) {
      const raw = partManifold(m, part, scratch)
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
    for (let h = 0; h < holes.length; h++) {
      const hb = toBBox(holeMfs[h])
      let cuts = false
      for (const s of solidRecords) {
        if (!bboxesOverlap(hb, s.bbox)) continue
        const inter = scratch.keep(m.Manifold.intersection(s.mf, holeMfs[h]))
        if (inter.volume() > 1) {
          cuts = true
          break
        }
      }
      if (!cuts) idleHoles.push(holes[h].id)
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
  const solids = doc.parts.filter((p) => p.role === 'solid')
  if (solids.length === 0) throw new Error('There is nothing solid to export yet.')
  const solidMfs = solids.map((p) => partManifold(m, p, scratch))
  let combined =
    solidMfs.length === 1 ? solidMfs[0] : scratch.keep(m.Manifold.union(solidMfs))
  const holes = doc.parts.filter((p) => p.role === 'hole')
  if (holes.length > 0) {
    const holeMfs = holes.map((p) => partManifold(m, p, scratch))
    const holesUnion =
      holeMfs.length === 1 ? holeMfs[0] : scratch.keep(m.Manifold.union(holeMfs))
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
      const raw = partManifold(m, part, scratch)
      const holes = doc.parts.filter((p) => p.role === 'hole')
      if (part.role === 'solid' && holes.length > 0) {
        const holeMfs = holes.map((p) => partManifold(m, p, scratch))
        const holesUnion =
          holeMfs.length === 1 ? holeMfs[0] : scratch.keep(m.Manifold.union(holeMfs))
        body = scratch.keep(m.Manifold.difference(raw, holesUnion))
      } else {
        body = raw
      }
    } else {
      body = combinedManifold(m, doc, scratch)
    }
    const zUp = scratch.keep(body.rotate([90, 0, 0]))
    const bb = zUp.boundingBox()
    const cross = zUp.slice((bb.min[2] + bb.max[2]) / 2)
    const polys = cross.toPolygons() as [number, number][][]
    cross.delete()
    return polys.map((poly) => poly.map((pt) => [pt[0], pt[1]] as [number, number]))
  } finally {
    scratch.dispose()
  }
}
