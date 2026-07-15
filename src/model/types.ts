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
export type Role = 'solid' | 'hole' | 'hardware'
export type ShapeKind =
  | 'board'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'wedge'
  | 'slot'
  | 'hardware'
  // Joinery cutters — always role 'hole'. Local frame for all five: the cut
  // RUNS along local X ('span'), depth is local Y, and like every primitive
  // they are built centered on the origin of their local bounding box.
  | 'dado' // channel ACROSS a board
  | 'groove' // channel ALONG a board (a dado turned 90° — the span axis differs relative to the host)
  | 'rabbet' // step along an edge
  | 'tenon' // cuts a board end, leaving a tongue
  | 'edge-profile' // router profile along one edge (roundover / chamfer / cove)

export interface Part {
  id: string
  name: string
  kind: ShapeKind
  role: Role
  /** Toolbar item this was created from ('board', 'dowel', 'block', 'round-hole', ...). Drives naming and label wording only. */
  variant?: string
  /**
   * Dimensions in mm. Keys per kind are defined by DIM_SPECS; for hardware
   * (kind 'hardware') the keys are the catalog entry's param specs.
   */
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
  /**
   * A cut or hardware item can belong to a host board: it moves and turns
   * with the host (host -> child only, never the reverse), and dies with it.
   */
  hostId?: string
  /** Which hardware catalog entry this part is (kind === 'hardware' only). */
  catalogId?: string
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
  /** Minimum value in mm (or in units of the param, when integer). */
  min: number
  /** A plain count, not a length — no unit conversion, whole numbers only. */
  integer?: boolean
  /**
   * Local axis this dimension stretches along (0=x, 1=y, 2=z), when it maps
   * to a bounding-box side. Radial dims (diameter) omit it. A tenon's tongue
   * dims and an edge-profile's size stretch along their axis without spanning
   * the whole bbox side; they still declare it for handles and labels.
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
  // --- joinery cutters (role 'hole') --------------------------------------
  // 'span' is the UNHOSTED fallback: when the cutter is attached to a host
  // board, evaluation replaces it with the host's extent along the cutter's
  // local X plus a 2mm overshoot, so the cut always runs the full board even
  // after the board is resized (see effectiveSpan / spanWithHost).
  dado: [
    { key: 'width', label: 'Channel width', min: 0.5, axis: 2 },
    { key: 'deep', label: 'Deep', min: 0.5, axis: 1 },
    { key: 'span', label: 'Runs', min: 1, axis: 0 },
  ],
  groove: [
    { key: 'width', label: 'Channel width', min: 0.5, axis: 2 },
    { key: 'deep', label: 'Deep', min: 0.5, axis: 1 },
    { key: 'span', label: 'Runs', min: 1, axis: 0 },
  ],
  rabbet: [
    { key: 'width', label: 'Width', min: 0.5, axis: 2 },
    { key: 'deep', label: 'Deep', min: 0.5, axis: 1 },
    { key: 'span', label: 'Runs', min: 1, axis: 0 },
  ],
  // The removed material is (body box [length, bodyT, bodyW]) minus (tongue
  // box [length, tongueThickness, tongueWidth]); bodyT/bodyW come from the
  // HOST at evaluation time (4x the tongue when unhosted — see tenonBodySize).
  tenon: [
    { key: 'length', label: 'Length', min: 1, axis: 0 },
    { key: 'tongueThickness', label: 'Tongue thickness', min: 0.5, axis: 1 },
    { key: 'tongueWidth', label: 'Tongue width', min: 1, axis: 2 },
  ],
  // 'profile' encodes the router bit: 0 = roundover, 1 = chamfer, 2 = cove
  // (see EDGE_PROFILE_NAMES / edgeProfileIndex). The profiled corner is the
  // cutter's local TOP-FRONT edge: the +Y +Z corner of its bounding box.
  'edge-profile': [
    { key: 'size', label: 'Size', min: 0.5, axis: 1 },
    { key: 'span', label: 'Runs', min: 1, axis: 0 },
    { key: 'profile', label: 'Shape', min: 0, integer: true },
  ],
  // hardware params come from the catalog entry — see dimSpecsFor()
  hardware: [],
}

/**
 * The hardware catalog (model/hardware.ts) registers itself here at module
 * load, so types.ts can answer size/spec questions for hardware parts without
 * importing the catalog (which imports this file).
 */
export interface HardwareHooks {
  dimSpecs(catalogId: string): DimSpec[]
  localSize(catalogId: string, dims: Record<string, number>): [number, number, number]
}
let hardwareHooks: HardwareHooks | null = null
export function registerHardwareHooks(h: HardwareHooks): void {
  hardwareHooks = h
}

/** The dimension specs for a part, wherever they live. */
export function dimSpecsFor(part: Pick<Part, 'kind' | 'catalogId'>): DimSpec[] {
  if (part.kind === 'hardware') return hardwareHooks?.dimSpecs(part.catalogId ?? '') ?? []
  return DIM_SPECS[part.kind]
}

/**
 * Label overrides where the plain word depends on what the part is FOR:
 * a Dowel has a Length; a Round Hole has a Deep.
 */
export function dimLabel(part: Part, key: string): string {
  if (part.role === 'hole') {
    if (key === 'height' || key === 'thickness') return 'Deep'
  }
  const spec = dimSpecsFor(part).find((s) => s.key === key)
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
      // the engine clamps a slot's width to its length (a wider-than-long
      // slot is just a circle of diameter = length)
      return [d.length, d.deep, Math.min(d.width, d.length)]
    case 'dado':
    case 'groove':
    case 'rabbet':
      // span along X, deep along Y, width across Z. Uses dims.span (the
      // unhosted fallback) — the engine resolves the hosted span itself.
      return [d.span, d.deep, d.width]
    case 'tenon':
      // unhosted fallback body: 4x the tongue each way (hosted, the engine
      // sizes the body from the host at eval time — see tenonBodySize)
      return [d.length, 4 * d.tongueThickness, 4 * d.tongueWidth]
    case 'edge-profile':
      // a size x size prism running along X (the true shape is within it)
      return [d.span, d.size, d.size]
    case 'hardware':
      return hardwareHooks?.localSize(part.catalogId ?? '', d) ?? [10, 10, 10]
  }
}

// --------------------------------------------------------- joinery helpers

/** Cutter kinds whose 'span' dim is replaced by the host's extent at eval time. */
export const SPAN_KINDS: ReadonlySet<ShapeKind> = new Set([
  'dado',
  'groove',
  'rabbet',
  'edge-profile',
])

/** Extra length added to host-derived sizes so the cut always clears the faces. */
export const SPAN_OVERSHOOT_MM = 2

/** The host board a part is attached to, if it exists in the doc. */
export function hostOf(doc: Doc, part: Part): Part | undefined {
  return part.hostId ? doc.parts.find((p) => p.id === part.hostId) : undefined
}

/**
 * Extent of the host's world-axis-aligned bounding box measured along the
 * cutter's local axis, expressed in world space (column `localAxis` of the
 * cutter's rotation matrix). This is what lets a hosted channel keep running
 * the full board no matter how either part is turned.
 */
export function hostExtentAlong(cutter: Part, host: Part, localAxis: 0 | 1 | 2): number {
  const R = rotationMatrix(cutter.rotation)
  const dir = [R[0][localAxis], R[1][localAxis], R[2][localAxis]]
  const ws = worldSize(host)
  return Math.abs(dir[0]) * ws[0] + Math.abs(dir[1]) * ws[1] + Math.abs(dir[2]) * ws[2]
}

/**
 * The span a cutter actually runs given its (possibly absent) host:
 * hosted -> the host's extent along the cutter's local X + 2mm overshoot,
 * unhosted -> dims.span exactly as typed.
 */
export function spanWithHost(part: Part, host: Part | undefined): number {
  if (!host || !SPAN_KINDS.has(part.kind)) return part.dims.span
  return hostExtentAlong(part, host, 0) + SPAN_OVERSHOOT_MM
}

/**
 * Doc-level convenience for the exporters: resolve a cutter's effective span
 * the same way the engine does (the engine passes the host Part directly).
 */
export function effectiveSpan(doc: Doc, part: Part): number {
  return spanWithHost(part, hostOf(doc, part))
}

/**
 * The tenon's removed-material box across the board end: [bodyThickness,
 * bodyWidth] along the cutter's local Y and Z. Hosted -> the host's extents
 * (+ overshoot so the cut clears the faces); unhosted -> 4x the tongue,
 * matching localSize()'s fallback.
 */
export function tenonBodySize(part: Part, host: Part | undefined): [number, number] {
  if (!host) return [4 * part.dims.tongueThickness, 4 * part.dims.tongueWidth]
  return [
    hostExtentAlong(part, host, 1) + SPAN_OVERSHOOT_MM,
    hostExtentAlong(part, host, 2) + SPAN_OVERSHOOT_MM,
  ]
}

/** Plain names for the edge-profile 'profile' dim, indexed 0/1/2. */
export const EDGE_PROFILE_NAMES = ['Roundover', 'Chamfer', 'Cove'] as const

/** The 'profile' dim decoded and clamped: 0 = roundover, 1 = chamfer, 2 = cove. */
export function edgeProfileIndex(v: number | undefined): 0 | 1 | 2 {
  const n = Math.round(v ?? 0)
  return n <= 0 ? 0 : n >= 2 ? 2 : 1
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

/**
 * Distance from the part's position down to the true bottom of its world
 * bounding box. For box-like shapes this is worldSize()[1]/2; round shapes
 * get exact support math so re-seating never leaves them hovering.
 */
export function worldBottomOffset(part: Part): number {
  const d = part.dims
  const r = rotationMatrix(part.rotation)[1] // world-y row
  const horiz = Math.hypot(r[0], r[2])
  switch (part.kind) {
    case 'sphere':
      return d.diameter / 2
    case 'cylinder': {
      // support of two circles at local y = ±h/2, radius dia/2
      const half = (d.height / 2) * Math.abs(r[1]) + (d.diameter / 2) * horiz
      return half
    }
    case 'cone': {
      // base circle at -h/2 (radius d/2), top circle at +h/2 (radius topD/2);
      // the rotated bbox is not centered on position, so return -minY exactly
      const yBase = (-d.height / 2) * r[1]
      const yTop = (d.height / 2) * r[1]
      const minY = Math.min(
        yBase - (d.diameter / 2) * horiz,
        yTop - (d.topDiameter / 2) * horiz,
      )
      return -minY
    }
    default:
      return worldSize(part)[1] / 2
  }
}

export function clampDims(
  kind: ShapeKind,
  dims: Record<string, number>,
  catalogId?: string,
): Record<string, number> {
  const out: Record<string, number> = { ...dims }
  const specs = kind === 'hardware' ? dimSpecsFor({ kind, catalogId }) : DIM_SPECS[kind]
  for (const spec of specs) {
    const v = out[spec.key]
    if (!Number.isFinite(v) || v < spec.min) out[spec.key] = spec.min
    else if (v > MAX_DIM_MM) out[spec.key] = MAX_DIM_MM
  }
  return out
}
