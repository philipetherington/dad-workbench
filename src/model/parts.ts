// Toolbar catalogue and part factories.
// Terminology and default sizes follow the design spec: pieces are named for
// what they are at the lumberyard, and defaults are stock a woodworker has
// actually held (a Board is a two-foot 1x6, a Dowel is 3/4" x 12" lying down).

import { IN } from './units'
import { HARDWARE } from './hardware'
import type { Doc, Part, Role, ShapeKind, UnitSystem } from './types'

/** Warm maple for new solids; selection state carries the accent color. */
export const SOLID_COLORS = [
  '#c9a06a', // maple
  '#b98a54', // oak
  '#a06e3f', // walnut-light
  '#c98f6e', // cherry
]

export const HOLE_COLOR = '#e05d5d'

export interface ToolbarItem {
  id: string
  label: string
  kind: ShapeKind
  role: Role
  /** Default dims in mm for the given unit system. */
  dims: (units: UnitSystem) => Record<string, number>
  /** Some pieces arrive in a natural posture (a dowel lies down). */
  rotation?: [number, number, number]
}

export const SOLID_ITEMS: ToolbarItem[] = [
  {
    id: 'board',
    label: 'Board',
    kind: 'board',
    role: 'solid',
    dims: (u) =>
      u === 'in'
        ? { length: 24 * IN, width: 5.5 * IN, thickness: 0.75 * IN }
        : { length: 600, width: 140, thickness: 18 },
  },
  {
    id: 'dowel',
    label: 'Dowel',
    kind: 'cylinder',
    role: 'solid',
    dims: (u) =>
      u === 'in' ? { diameter: 0.75 * IN, height: 12 * IN } : { diameter: 20, height: 300 },
    // lying on the bench, axis along X
    rotation: [0, 0, 90],
  },
  {
    id: 'block',
    label: 'Block',
    kind: 'board',
    role: 'solid',
    dims: (u) =>
      u === 'in'
        ? { length: 4 * IN, width: 4 * IN, thickness: 4 * IN }
        : { length: 100, width: 100, thickness: 100 },
  },
  {
    id: 'ball',
    label: 'Ball',
    kind: 'sphere',
    role: 'solid',
    dims: (u) => (u === 'in' ? { diameter: 1.5 * IN } : { diameter: 40 }),
  },
  {
    id: 'wedge',
    label: 'Wedge',
    kind: 'wedge',
    role: 'solid',
    dims: (u) =>
      u === 'in'
        ? { length: 4 * IN, width: 1.5 * IN, height: 1 * IN }
        : { length: 100, width: 40, height: 25 },
  },
  {
    id: 'cone',
    label: 'Cone',
    kind: 'cone',
    role: 'solid',
    dims: (u) =>
      u === 'in'
        ? { diameter: 1.5 * IN, topDiameter: 0, height: 1.5 * IN }
        : { diameter: 40, topDiameter: 0, height: 40 },
  },
]

export const HOLE_ITEMS: ToolbarItem[] = [
  {
    id: 'round-hole',
    label: 'Round Hole',
    kind: 'cylinder',
    role: 'hole',
    dims: (u) => (u === 'in' ? { diameter: 0.5 * IN, height: 2 * IN } : { diameter: 12, height: 50 }),
  },
  {
    id: 'square-hole',
    label: 'Square Hole',
    kind: 'board',
    role: 'hole',
    dims: (u) =>
      u === 'in'
        ? { length: 1 * IN, width: 1 * IN, thickness: 2 * IN }
        : { length: 25, width: 25, thickness: 50 },
  },
  {
    id: 'slot',
    label: 'Slot',
    kind: 'slot',
    role: 'hole',
    dims: (u) =>
      u === 'in' ? { length: 2 * IN, width: 0.5 * IN, deep: 2 * IN } : { length: 50, width: 12, deep: 50 },
  },
]

/**
 * Joinery cutters — the cabinetmaker's family of cuts. All role 'hole'.
 * Drop one on a board and it attaches; dado/groove/rabbet/edge trims then
 * run the FULL board automatically (span is just the unhosted fallback).
 */
export const JOINERY_ITEMS: ToolbarItem[] = [
  {
    id: 'dado',
    label: 'Dado',
    kind: 'dado',
    role: 'hole',
    dims: (u) =>
      u === 'in'
        ? { width: 0.75 * IN, deep: 0.375 * IN, span: 12 * IN }
        : { width: 18, deep: 9, span: 300 },
  },
  {
    id: 'groove',
    label: 'Groove',
    kind: 'groove',
    role: 'hole',
    // a groove runs ALONG the board: spawn turned 90° so its span lies along Z
    rotation: [0, 90, 0],
    dims: (u) =>
      u === 'in'
        ? { width: 0.25 * IN, deep: 0.375 * IN, span: 12 * IN }
        : { width: 6, deep: 9, span: 300 },
  },
  {
    id: 'rabbet',
    label: 'Rabbet',
    kind: 'rabbet',
    role: 'hole',
    dims: (u) =>
      u === 'in'
        ? { width: 0.5 * IN, deep: 0.375 * IN, span: 12 * IN }
        : { width: 12, deep: 9, span: 300 },
  },
  {
    id: 'tenon',
    label: 'Tenon',
    kind: 'tenon',
    role: 'hole',
    dims: (u) =>
      u === 'in'
        ? { length: 1.5 * IN, tongueThickness: 0.375 * IN, tongueWidth: 2 * IN }
        : { length: 40, tongueThickness: 9, tongueWidth: 50 },
  },
  {
    id: 'edge-profile',
    label: 'Rounded Edge',
    kind: 'edge-profile',
    role: 'hole',
    dims: (u) =>
      u === 'in'
        ? { size: 0.375 * IN, span: 12 * IN, profile: 0 }
        : { size: 9, span: 300, profile: 0 },
  },
]

/** Hardware toolbar items come straight from the catalog. */
export const HARDWARE_ITEMS: ToolbarItem[] = HARDWARE.map((def) => ({
  id: def.id,
  label: def.label,
  kind: 'hardware' as const,
  role: 'hardware' as const,
  dims: (u: UnitSystem) => def.defaults(u),
}))

export const ALL_ITEMS = [...SOLID_ITEMS, ...HOLE_ITEMS, ...JOINERY_ITEMS, ...HARDWARE_ITEMS]

export function toolbarItem(id: string): ToolbarItem | undefined {
  return ALL_ITEMS.find((t) => t.id === id)
}

let colorCursor = 0

export function nextColor(): string {
  const c = SOLID_COLORS[colorCursor % SOLID_COLORS.length]
  colorCursor += 1
  return c
}

/** 'Board 3', 'Round Hole 2', ... based on what's already in the doc. */
export function autoName(doc: Doc, base: string): string {
  let n = 1
  const taken = new Set(doc.parts.map((p) => p.name))
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export function createPart(doc: Doc, item: ToolbarItem): Part {
  const hardware = item.role === 'hardware' ? HARDWARE.find((h) => h.id === item.id) : undefined
  return {
    id: crypto.randomUUID(),
    name: autoName(doc, item.label),
    kind: item.kind,
    role: item.role,
    variant: item.id,
    dims: item.dims(doc.units),
    position: [0, 0, 0], // caller places it (store.addPart)
    rotation: item.rotation ? [...item.rotation] : [0, 0, 0],
    color: hardware ? hardware.color : item.role === 'hole' ? HOLE_COLOR : nextColor(),
    ...(hardware ? { catalogId: hardware.id } : {}),
  }
}

export function emptyDoc(units: UnitSystem = 'in'): Doc {
  return {
    version: 1,
    name: 'My First Project',
    units,
    snapStep: units === 'in' ? IN / 16 : 1,
    parts: [],
    glues: [],
  }
}
