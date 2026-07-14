// Core document model for Workbench.
//
// Conventions (every module in the app relies on these):
//   - All lengths are stored in MILLIMETERS, everywhere, always.
//     Unit conversion happens only at the display/input boundary (units.ts).
//   - The world is Y-UP: the bench surface is the XZ plane at y = 0.
//     Exporters convert to Z-up at export time (exporters/*).
//   - `position` is the CENTER of the part's local bounding box, in world mm.
//   - `rotation` is XYZ Euler angles in DEGREES, three.js 'XYZ' intrinsic order,
//     i.e. the rotation matrix is R = Rx · Ry · Rz.

export type UnitSystem = 'in' | 'mm'
export type Role = 'solid' | 'hole'
export type ShapeKind = 'board' | 'cylinder' | 'sphere' | 'cone' | 'wedge' | 'slot'

export interface Part {
  id: string
  name: string
  kind: ShapeKind
  role: Role
  /** Toolbar item this was created from ('board', 'dowel', 'block', 'round-hole', ...). Drives naming and label wording only. */
  variant?: string
  /** Dimensions in mm. Keys per kind are defined by DIM_SPECS. */
  dims: Record<string, number>
  /** Center of local bounding box, world mm, y-up. */
  position: [number, number, number]
  /** Euler XYZ, degrees. */
  rotation: [number, number, number]
  /** Hex display color for solids (holes render in the fixed hole style). */
  color: string
  /** 'Hold in Place': part refuses drags/nudges until unpinned. */
  locked?: boolean
  /** Parts glued together share a glueId; they select and move as one. */
  glueId?: string
}

export interface Glue {
  id: string
  name: string
}

export interface Doc {
  version: 1
  name: string
  units: UnitSystem
  /** Grid/drag snap increment in mm. */
  snapStep: number
  parts: Part[]
  glues: Glue[]
}

export interface DimSpec {
  key: string
  /** Plain-language label shown in the inspector. */
  label: string
  /** Minimum value in mm. */
  min: number
  /**
   * Local axis this dimension stretches along (0=x, 1=y, 2=z), when it maps
   * directly to a bounding-box side. Radial dims (diameter) omit it.
   */
  axis?: 0 | 1 | 2
}

/** ~20 feet: beyond any real project, small enough to keep the math sane. */
export const MAX_DIM_MM = 6100

export const DIM_SPECS: Record<ShapeKind, DimSpec[]> = {
  board: [
    { key: 'length', label: 'Length', min: 1, axis: 0 },
    { key: 'width', label: 'Width', min: 1, axis: 2 },
    { key: 'thickness', label: 'Thickness', min: 0.5, axis: 1 },
  ],
  cylinder: [
    { key: 'diameter', label: 'Across (diameter)', min: 0.5 },
    { key: 'height', label: 'Length', min: 0.5, axis: 1 },
  ],
  sphere: [{ key: 'diameter', label: 'Across (diameter)', min: 0.5 }],
  cone: [
    { key: 'diameter', label: 'Across the bottom', min: 0.5 },
    { key: 'topDiameter', label: 'Across the top', min: 0 },
    { key: 'height', label: 'Height', min: 0.5, axis: 1 },
  ],
  wedge: [
    { key: 'length', label: 'Length', min: 1, axis: 0 },
    { key: 'width', label: 'Width', min: 1, axis: 2 },
    { key: 'height', label: 'Height', min: 1, axis: 1 },
  ],
  slot: [
    { key: 'length', label: 'Length', min: 1, axis: 0 },
    { key: 'width', label: 'Width', min: 0.5, axis: 2 },
    { key: 'deep', label: 'Deep', min: 0.5, axis: 1 },
  ],
}

/**
 * Label overrides where the plain word depends on what the part is FOR:
 * a Dowel has a Length; a Round Hole has a Deep.
 */
export function dimLabel(part: Part, key: string): string {
  if (part.role === 'hole') {
    if (key === 'height' || key === 'thickness') return 'Deep'
  }
  const spec = DIM_SPECS[part.kind].find((s) => s.key === key)
  return spec ? spec.label : key
}

/**
 * Size of the part's local (unrotated) bounding box, in mm.
 * Primitives are built centered on the origin of this box (engine/evaluate.ts).
 */
export function localSize(part: Part): [number, number, number] {
  const d = part.dims
  switch (part.kind) {
    case 'board':
      return [d.length, d.thickness, d.width]
    case 'cylinder':
      return [d.diameter, d.height, d.diameter]
    case 'sphere':
      return [d.diameter, d.diameter, d.diameter]
    case 'cone': {
      const dia = Math.max(d.diameter, d.topDiameter)
      return [dia, d.height, dia]
    }
    case 'wedge':
      return [d.length, d.height, d.width]
    case 'slot':
      return [Math.max(d.length, d.width), d.deep, d.width]
  }
}

/** Rotation matrix R = Rx·Ry·Rz from Euler XYZ degrees (three.js 'XYZ' order). */
export function rotationMatrix(rotation: [number, number, number]): number[][] {
  const [ax, ay, az] = rotation.map((d) => (d * Math.PI) / 180)
  const cx = Math.cos(ax), sx = Math.sin(ax)
  const cy = Math.cos(ay), sy = Math.sin(ay)
  const cz = Math.cos(az), sz = Math.sin(az)
  // Rx · Ry · Rz
  return [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ]
}

/**
 * Size of the world-axis-aligned bounding box of the part's local box after
 * rotation (exact for the box; the true shape may be smaller within it).
 */
export function worldSize(part: Part): [number, number, number] {
  const s = localSize(part)
  const R = rotationMatrix(part.rotation)
  return [0, 1, 2].map((i) =>
    Math.abs(R[i][0]) * s[0] + Math.abs(R[i][1]) * s[1] + Math.abs(R[i][2]) * s[2],
  ) as [number, number, number]
}

export function clampDims(kind: ShapeKind, dims: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...dims }
  for (const spec of DIM_SPECS[kind]) {
    const v = out[spec.key]
    if (!Number.isFinite(v) || v < spec.min) out[spec.key] = spec.min
    else if (v > MAX_DIM_MM) out[spec.key] = MAX_DIM_MM
  }
  return out
}
