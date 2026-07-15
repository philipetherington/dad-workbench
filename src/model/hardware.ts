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
  category: 'hinges' | 'slides' | 'pins' | 'fasteners' | 'pulls'
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

/** Traditional butt hinge: two leaves open flat around a barrel, mortised in. */
const buttHinge: HardwareDef = {
  id: 'butt-hinge',
  label: 'Butt Hinge',
  category: 'hinges',
  params: [
    { key: 'leafWidth', label: 'Leaf width', min: 10 },
    { key: 'leafHeight', label: 'Leaf height', min: 25 },
    { key: 'thickness', label: 'Leaf thickness', min: 1 },
  ],
  defaults: (units) =>
    units === 'in'
      ? { leafWidth: 0.75 * IN, leafHeight: 3 * IN, thickness: 2 }
      : { leafWidth: 20, leafHeight: 75, thickness: 2 },
  color: '#ab9260',
  visual: (d): PrimSpec[] => [
    // the two leaves, opened flat on the wood, meeting at the barrel
    { kind: 'board', dims: { length: d.leafWidth, width: d.leafHeight, thickness: d.thickness }, position: [-d.leafWidth / 2, 0, 0] },
    { kind: 'board', dims: { length: d.leafWidth, width: d.leafHeight, thickness: d.thickness }, position: [d.leafWidth / 2, 0, 0] },
    // barrel along the knuckle line
    { kind: 'cylinder', dims: { diameter: d.thickness * 3, height: d.leafHeight }, position: [0, d.thickness / 2, 0], rotation: [90, 0, 0] },
  ],
  cutters: (d): PrimSpec[] => [
    // shallow mortise: the open-leaf footprint, one leaf thickness deep
    { kind: 'board', dims: { length: d.leafWidth * 2, width: d.leafHeight, thickness: d.thickness }, position: [0, 0, 0] },
    // screw pilots (simplified to three across both leaves)
    { kind: 'cylinder', dims: { diameter: 3, height: 10 }, position: [-d.leafWidth / 2, -5, d.leafHeight / 4] },
    { kind: 'cylinder', dims: { diameter: 3, height: 10 }, position: [-d.leafWidth / 2, -5, -d.leafHeight / 4] },
    { kind: 'cylinder', dims: { diameter: 3, height: 10 }, position: [d.leafWidth / 2, -5, 0] },
  ],
  localSize: (d) => [d.leafWidth * 2, d.thickness * 4, d.leafHeight],
  shoppingLine: (d) => {
    const inches = Math.round((d.leafHeight / IN) * 2) / 2
    return `${inches}" butt hinge`
  },
}

/** One side-mount drawer slide rail (place one per side; sold in pairs). */
const drawerSlide: HardwareDef = {
  id: 'drawer-slide',
  label: 'Drawer Slide',
  category: 'slides',
  params: [{ key: 'length', label: 'Length', min: 250 }],
  defaults: (units) => (units === 'in' ? { length: 18 * IN } : { length: 450 }),
  color: '#9ba3ad',
  visual: (d): PrimSpec[] => [
    // the closed rail, back against the wood
    { kind: 'board', dims: { length: d.length, width: 45, thickness: 12.7 }, position: [0, 6.35, 0] },
  ],
  cutters: (d): PrimSpec[] => [
    // three mounting screw pilots along the rail
    { kind: 'cylinder', dims: { diameter: 3, height: 10 }, position: [-d.length / 2 + 30, -5, 0] },
    { kind: 'cylinder', dims: { diameter: 3, height: 10 }, position: [0, -5, 0] },
    { kind: 'cylinder', dims: { diameter: 3, height: 10 }, position: [d.length / 2 - 30, -5, 0] },
  ],
  localSize: (d) => [d.length, 22.7, 45],
  shoppingLine: (d) => {
    const inches = Math.round(d.length / IN)
    return `side-mount drawer slide, ${inches}" — sold in pairs`
  },
}

/** Pocket screw: the Kreg-style bore, 15 degrees off the surface. */
const pocketScrew: HardwareDef = {
  id: 'pocket-screw',
  label: 'Pocket Screw',
  category: 'fasteners',
  params: [{ key: 'length', label: 'Length', min: 25 }],
  defaults: (units) => (units === 'in' ? { length: 2.5 * IN } : { length: 65 }),
  color: '#8d949c',
  visual: (d): PrimSpec[] => [
    // a small plug disc marking the pocket mouth
    { kind: 'cylinder', dims: { diameter: 9.5, height: 2 }, position: [entryX(d), 0, 0], rotation: [0, 0, 75] },
  ],
  cutters: (d): PrimSpec[] => {
    // an unrotated cylinder's axis is local Y; [0,0,75] tips that axis 75
    // degrees toward X, i.e. the bore runs 15 degrees off the surface plane,
    // descending into the wood as it goes.
    const [c, s] = SLOPE_15
    const e = entryX(d)
    const pocket = d.length * 0.55
    return [
      // the stepped pocket bore
      { kind: 'cylinder', dims: { diameter: 9.5, height: pocket }, position: [e + (c * pocket) / 2, (-s * pocket) / 2, 0], rotation: [0, 0, 75] },
      // the thin pilot continuing along the same axis, full screw length
      { kind: 'cylinder', dims: { diameter: 4, height: d.length }, position: [e + (c * d.length) / 2, (-s * d.length) / 2, 0], rotation: [0, 0, 75] },
    ]
  },
  localSize: (d) => [d.length, d.length * 0.35, 10],
  shoppingLine: (d) => {
    const inches = Math.round((d.length / IN) * 4) / 4
    return `${inches}" pocket screws`
  },
}

/** cos/sin of the pocket-screw angle: 15 degrees off the surface. */
const SLOPE_15: [number, number] = [Math.cos((15 * Math.PI) / 180), Math.sin((15 * Math.PI) / 180)]
/** Where the pocket-screw bore breaks the surface, local x. */
function entryX(d: Record<string, number>): number {
  return -d.length * 0.45
}

/** Dowel pin: the pin itself, proud a hair, plus its matching bore. */
const dowelPin: HardwareDef = {
  id: 'dowel-pin',
  label: 'Dowel Pin',
  category: 'fasteners',
  params: [
    { key: 'diameter', label: 'Across (diameter)', min: 3 },
    { key: 'length', label: 'Length', min: 10 },
  ],
  defaults: () => ({ diameter: 8, length: 40 }),
  color: '#c99b62',
  visual: (d): PrimSpec[] => [
    // the dowel, seated in its bore and proud of the surface by a hair
    { kind: 'cylinder', dims: { diameter: d.diameter - 0.2, height: d.length }, position: [0, 1 - d.length / 2, 0] },
  ],
  cutters: (d): PrimSpec[] => [
    // the matching bore, straight down
    { kind: 'cylinder', dims: { diameter: d.diameter, height: d.length }, position: [0, -d.length / 2, 0] },
  ],
  localSize: (d) => [d.diameter, d.length + 1, d.diameter],
  shoppingLine: (d) => `${Math.round(d.diameter)}mm dowel pins`,
}

/** Round knob on a short stem; one 5mm through-bore for its machine screw. */
const knob: HardwareDef = {
  id: 'knob',
  label: 'Knob',
  category: 'pulls',
  params: [{ key: 'diameter', label: 'Across (diameter)', min: 15 }],
  defaults: (units) => (units === 'in' ? { diameter: 1.25 * IN } : { diameter: 32 }),
  color: '#8d949c',
  visual: (d): PrimSpec[] => [
    // stem
    { kind: 'cylinder', dims: { diameter: 9, height: 6 }, position: [0, 3, 0] },
    // squashed cap
    { kind: 'cylinder', dims: { diameter: d.diameter, height: d.diameter * 0.45 }, position: [0, 6 + d.diameter * 0.225, 0] },
  ],
  cutters: (): PrimSpec[] => [
    // 5mm through-bore for the machine screw
    { kind: 'cylinder', dims: { diameter: 5, height: 30 }, position: [0, -15, 0] },
  ],
  localSize: (d) => [d.diameter, 6 + d.diameter * 0.45, d.diameter],
  shoppingLine: (d) => {
    const inches = Math.round((d.diameter / IN) * 4) / 4
    return `${inches}" knob`
  },
}

/** Bar pull on two posts; two 5mm bores at the screw-centers spacing. */
const barPull: HardwareDef = {
  id: 'pull',
  label: 'Pull',
  category: 'pulls',
  params: [{ key: 'centers', label: 'Screw centers', min: 32 }],
  defaults: () => ({ centers: 96 }),
  color: '#9ba3ad',
  visual: (d): PrimSpec[] => [
    // two posts
    { kind: 'cylinder', dims: { diameter: 10, height: 30 }, position: [0, 15, d.centers / 2] },
    { kind: 'cylinder', dims: { diameter: 10, height: 30 }, position: [0, 15, -d.centers / 2] },
    // the bar, along the knuckles' line (local Z), overhanging each post
    { kind: 'cylinder', dims: { diameter: 12, height: d.centers + 40 }, position: [0, 36, 0], rotation: [90, 0, 0] },
  ],
  cutters: (d): PrimSpec[] => [
    { kind: 'cylinder', dims: { diameter: 5, height: 40 }, position: [0, -20, d.centers / 2] },
    { kind: 'cylinder', dims: { diameter: 5, height: 40 }, position: [0, -20, -d.centers / 2] },
  ],
  localSize: (d) => [12, 42, d.centers + 40],
  shoppingLine: (d) => `${Math.round(d.centers)}mm bar pull`,
}

export const HARDWARE: HardwareDef[] = [
  shelfPinRow,
  cupHinge,
  buttHinge,
  drawerSlide,
  woodScrew,
  pocketScrew,
  dowelPin,
  knob,
  barPull,
]

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
