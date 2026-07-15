// The hardware catalog.
//
// Every entry is DECLARATIVE: its visual body and the holes it bores are
// lists of primitive specs (the same box/cylinder/cone primitives as pieces).
// That one decision means hardware flows through the existing pipeline
// end-to-end — the engine builds it with the same code that builds a Board,
// the OpenSCAD exporter emits it with the same codegen, and STL/DXF see its
// bores exactly like hand-placed holes. No special geometry paths anywhere.
//
// Local frame convention for an entry: y-up, origin at the CENTER of the
// entry's bounding box (same as any part), mounting face toward -y — i.e.
// the item "sits on" the wood at its local bottom, and its cutters extend
// downward into the material.

import type { DimSpec, Part, ShapeKind } from './types'
import { registerHardwareHooks } from './types'
import { IN } from './units'

/** One primitive of a hardware item's visual body or cutter set. */
export interface PrimSpec {
  kind: Exclude<ShapeKind, 'hardware'>
  dims: Record<string, number>
  /** Offset in the entry's local frame, mm. */
  position: [number, number, number]
  /** Euler XYZ degrees, same convention as parts. */
  rotation?: [number, number, number]
}

export interface HardwareDef {
  id: string
  label: string
  category: 'hinges' | 'pins' | 'fasteners'
  /** Editable params, rendered with the same fields as piece measurements. */
  params: DimSpec[]
  defaults: (units: 'in' | 'mm') => Record<string, number>
  /** Metal color for the viewport. */
  color: string
  /** The visible body. */
  visual: (d: Record<string, number>) => PrimSpec[]
  /** The holes it bores — subtracted from every solid they touch, live. */
  cutters: (d: Record<string, number>) => PrimSpec[]
  /** Local bbox size, for placement/handles/re-seat math. */
  localSize: (d: Record<string, number>) => [number, number, number]
  /** One line for the shopping list, e.g. '35mm cup hinge'. */
  shoppingLine: (d: Record<string, number>) => string
}

// ---------------------------------------------------------------- entries

/** Shelf-pin row: the System-32 column of 5mm holes every cabinetmaker knows. */
const shelfPinRow: HardwareDef = {
  id: 'shelf-pin-row',
  label: 'Shelf Pin Row',
  category: 'pins',
  params: [
    { key: 'count', label: 'How many holes', min: 2, integer: true },
    { key: 'spacing', label: 'Spacing', min: 10 },
    { key: 'diameter', label: 'Hole size', min: 3 },
    { key: 'deep', label: 'Deep', min: 5 },
  ],
  defaults: () => ({ count: 8, spacing: 32, diameter: 5, deep: 12 }),
  color: '#b8926a',
  visual: (d): PrimSpec[] => {
    // a slim witness rail so the row is visible and clickable; the pins
    // themselves are the buyer's hardware, not modeled
    const span = (Math.round(d.count) - 1) * d.spacing
    return [
      {
        kind: 'board',
        dims: { length: 10, width: span + 16, thickness: 3 },
        position: [0, d.deep / 2 + 1.5, 0],
      },
    ]
  },
  cutters: (d): PrimSpec[] => {
    const n = Math.max(2, Math.round(d.count))
    const span = (n - 1) * d.spacing
    const out: PrimSpec[] = []
    for (let i = 0; i < n; i++) {
      out.push({
        kind: 'cylinder',
        dims: { diameter: d.diameter, height: d.deep },
        position: [0, 0, i * d.spacing - span / 2],
      })
    }
    return out
  },
  localSize: (d) => {
    const span = (Math.max(2, Math.round(d.count)) - 1) * d.spacing
    return [10, d.deep + 3, span + 16]
  },
  shoppingLine: (d) =>
    `${Math.round(d.diameter)}mm shelf pins — ${Math.round(d.count)} holes at ${Math.round(d.spacing)}mm`,
}

/** Concealed cup hinge (Euro/Blum style): the 35mm bore plus two pilots. */
const cupHinge: HardwareDef = {
  id: 'cup-hinge',
  label: 'Cup Hinge',
  category: 'hinges',
  params: [
    { key: 'cup', label: 'Cup size', min: 20 },
    { key: 'cupDeep', label: 'Cup depth', min: 8 },
    { key: 'pilotSpread', label: 'Screw spread', min: 20 },
  ],
  defaults: () => ({ cup: 35, cupDeep: 11.5, pilotSpread: 45.5 }),
  color: '#9ba3ad',
  visual: (d): PrimSpec[] => [
    // cup body sitting in its bore
    { kind: 'cylinder', dims: { diameter: d.cup - 1, height: d.cupDeep }, position: [0, 0.5, 0] },
    // hinge plate over the top
    { kind: 'board', dims: { length: 40, width: d.pilotSpread + 14, thickness: 2.5 }, position: [8, d.cupDeep / 2 + 1.75, 0] },
  ],
  cutters: (d): PrimSpec[] => [
    { kind: 'cylinder', dims: { diameter: d.cup, height: d.cupDeep }, position: [0, 0, 0] },
    { kind: 'cylinder', dims: { diameter: 3, height: 11 }, position: [9.5, -0.25, d.pilotSpread / 2] },
    { kind: 'cylinder', dims: { diameter: 3, height: 11 }, position: [9.5, -0.25, -d.pilotSpread / 2] },
  ],
  localSize: (d) => [48, d.cupDeep + 3, d.pilotSpread + 14],
  shoppingLine: (d) => `${Math.round(d.cup)}mm cup hinge (concealed)`,
}

/** Wood screw: visible head, pilot + countersink bored for it. */
const woodScrew: HardwareDef = {
  id: 'wood-screw',
  label: 'Wood Screw',
  category: 'fasteners',
  params: [
    { key: 'length', label: 'Length', min: 12 },
    { key: 'shank', label: 'Thickness', min: 2.5 },
  ],
  defaults: (units) =>
    units === 'in' ? { length: 1.5 * IN, shank: 4 } : { length: 40, shank: 4 },
  color: '#8d949c',
  visual: (d): PrimSpec[] => [
    // head, proud of the surface by a hair
    { kind: 'cone', dims: { diameter: d.shank * 2.2, topDiameter: d.shank * 0.9, height: d.shank * 1.1 }, position: [0, -d.shank * 0.55 + 0.5, 0], rotation: [180, 0, 0] },
  ],
  cutters: (d): PrimSpec[] => [
    // pilot
    { kind: 'cylinder', dims: { diameter: d.shank * 0.7, height: d.length }, position: [0, -d.length / 2, 0] },
    // countersink
    { kind: 'cone', dims: { diameter: d.shank * 2.4, topDiameter: d.shank * 0.7, height: d.shank * 1.2 }, position: [0, -d.shank * 0.6, 0], rotation: [180, 0, 0] },
  ],
  localSize: (d) => [d.shank * 2.4, d.shank * 1.4, d.shank * 2.4],
  shoppingLine: (d) => {
    const inches = Math.round((d.length / IN) * 4) / 4
    return `#8 wood screws, ${inches}"`
  },
}

export const HARDWARE: HardwareDef[] = [shelfPinRow, cupHinge, woodScrew]

export function hardwareDef(catalogId: string | undefined): HardwareDef | undefined {
  return HARDWARE.find((h) => h.id === catalogId)
}

/** Shopping list: identical items grouped, with quantities. */
export function buildHardwareList(parts: Part[]): { line: string; qty: number }[] {
  const groups = new Map<string, { line: string; qty: number }>()
  for (const p of parts) {
    if (p.kind !== 'hardware') continue
    const def = hardwareDef(p.catalogId)
    if (!def) continue
    const line = def.shoppingLine(p.dims)
    const g = groups.get(line)
    if (g) g.qty += 1
    else groups.set(line, { line, qty: 1 })
  }
  return [...groups.values()]
}

// let types.ts answer spec/size questions for hardware parts
registerHardwareHooks({
  dimSpecs: (catalogId) => hardwareDef(catalogId)?.params ?? [],
  localSize: (catalogId, dims) => hardwareDef(catalogId)?.localSize(dims) ?? [10, 10, 10],
})
