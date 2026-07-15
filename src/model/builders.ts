// Parametric assembly builders: "Build a Drawer for Me" / "Build a Door for Me".
//
// Pure functions (params, units) -> { parts, glue }: no store access, no side
// effects beyond crypto.randomUUID() for ids, so every measurement is unit-
// testable. Both builders assemble around the origin, resting on the bench
// (group min-y = 0); the sheet nudges the finished group clear of existing work.
//
// Conventions (model/types.ts): mm, y-up, position = local-bbox center,
// rotation Euler XYZ degrees with R = Rx·Ry·Rz. Board recipes used here:
//   [0,0,90]  Standing Up          — worldSize [thickness, length, width]
//   [90,0,0]  On Edge, run along X — worldSize [length, width, thickness]
//   [90,0,90] On Edge, run along Z — worldSize [thickness, width, length]
//
// A groove's span runs its local X and its cut depth its local Y. Every groove
// below is rotated so local X lies along its host board's LONG axis (the
// engine then resizes the span from the host at eval time — spanWithHost) and
// local -Y points into the wood it cuts.

import { hardwareDef } from './hardware'
import { HOLE_COLOR, SOLID_COLORS } from './parts'
import type { Glue, Part, UnitSystem } from './types'

/** Drawer bottoms and door panels: 1/4" ply. */
const PLY = 6.35
/** Groove channel width: the 1/4" panel plus a whisker of sliding play. */
const GROOVE_WIDTH = 6.75
/** Groove centerline height above the drawer box's bottom edge. */
const GROOVE_LIFT = 9.5
/** How deep the drawer-bottom grooves cut into each wall. */
const DRAWER_GROOVE_DEEP = 6.35
/** Total vertical play for a side-mount drawer box: 1/2". */
const VERTICAL_PLAY = 12.7
/** Drawer slides come in 50mm length steps, never under 250mm. */
const SLIDE_LEN_STEP = 50
const SLIDE_LEN_MIN = 250
/** Door-panel grooves: 3/8" into every frame member's inner edge. */
const DOOR_GROOVE_DEEP = 9.5
/** Seasonal-movement gap the door panel leaves at each groove bottom. */
const PANEL_GAP = 1
/** Cup-hinge centers sit this far in from the door's top and bottom ends. */
const HINGE_FROM_END = 75
/** Cup-bore center inset from the door's hinge-side edge. */
const CUP_FROM_EDGE = 21.5

export interface DrawerParams {
  openingWidth: number
  openingHeight: number
  depth: number
  /** side thickness, default 12.7 */
  stock: number
  /** PER SIDE, default 6.35 = 1/2" total */
  slideClearance: number
}

export interface DoorParams {
  openingWidth: number
  openingHeight: number
  stileWidth: number
  railWidth: number
  stock: number
  /** 0 = inset */
  overlay: number
}

type Vec3 = [number, number, number]

function mkBoard(
  name: string,
  length: number,
  width: number,
  thickness: number,
  position: Vec3,
  rotation: Vec3,
  color: string,
  glueId: string,
): Part {
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'board',
    role: 'solid',
    variant: 'board',
    dims: { length, width, thickness },
    position,
    rotation,
    color,
    glueId,
  }
}

/**
 * A groove attached to `host`. `span` is only the unhosted fallback (kept at
 * the host's true length so the part still reads right if detached) — hosted,
 * the engine derives the span from the host along the groove's local X.
 */
function mkGroove(
  name: string,
  host: Part,
  deep: number,
  span: number,
  position: Vec3,
  rotation: Vec3,
): Part {
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'groove',
    role: 'hole',
    variant: 'groove',
    dims: { width: GROOVE_WIDTH, deep, span },
    position,
    rotation,
    color: HOLE_COLOR,
    hostId: host.id,
  }
}

function mkHardware(
  name: string,
  catalogId: string,
  dims: Record<string, number>,
  position: Vec3,
  rotation: Vec3,
  host: Part,
): Part {
  const def = hardwareDef(catalogId)!
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'hardware',
    role: 'hardware',
    variant: catalogId,
    catalogId,
    dims,
    position,
    rotation,
    color: def.color,
    hostId: host.id,
  }
}

/** Derived sizes never go non-positive, even on nonsense inputs. */
function atLeast1(v: number): number {
  return Math.max(1, v)
}

/**
 * A side-mount drawer box for the given cabinet opening: five boards, four
 * bottom grooves, two slides, glued as one 'Drawer'. Rests on the bench
 * centered on the origin, front toward -Z.
 */
export function buildDrawer(params: DrawerParams, units: UnitSystem): { parts: Part[]; glue: Glue } {
  const t = params.stock
  const W = atLeast1(params.openingWidth - 2 * params.slideClearance) // box outer width
  const H = atLeast1(params.openingHeight - VERTICAL_PLAY) // box height
  const D = atLeast1(params.depth) // box depth, front to back
  const sideLen = atLeast1(D - 2 * t)

  const glue: Glue = { id: crypto.randomUUID(), name: 'Drawer' }
  const gid = glue.id

  // Front and back run the full box width; the sides fit between them, so
  // every corner lands flush. All four walls stand on the bench (min y = 0).
  const front = mkBoard('Drawer front', W, H, t, [0, H / 2, -(D - t) / 2], [90, 0, 0], SOLID_COLORS[0], gid)
  const back = mkBoard('Drawer back', W, H, t, [0, H / 2, (D - t) / 2], [90, 0, 0], SOLID_COLORS[0], gid)
  const left = mkBoard('Left side', sideLen, H, t, [-(W - t) / 2, H / 2, 0], [90, 0, 90], SOLID_COLORS[1], gid)
  const right = mkBoard('Right side', sideLen, H, t, [(W - t) / 2, H / 2, 0], [90, 0, 90], SOLID_COLORS[1], gid)

  // The bottom: 1/4" ply seated on the grooves' lower shoulder, meeting the
  // walls' inner faces (the groove mouths) exactly. Solid boards may never
  // share space in Workbench — the engine flags interpenetration as an error
  // — so the panel stops flush at the groove mouths rather than running to
  // the groove bottoms; the channels still register it as captive.
  const shoulderY = GROOVE_LIFT - GROOVE_WIDTH / 2
  const bottom = mkBoard(
    'Drawer bottom',
    atLeast1(W - 2 * t),
    atLeast1(D - 2 * t),
    PLY,
    [0, shoulderY + PLY / 2, 0],
    [0, 0, 0],
    SOLID_COLORS[2],
    gid,
  )

  // One groove per wall, centerline GROOVE_LIFT above the box bottom edge.
  // Rotations, worked out against worldSize():
  //   front [90,0,0]:   local X->+X (span along the front), -Y->-Z (into it)
  //   back  [-90,0,0]:  local X->+X, -Y->+Z
  //   left  [-90,0,-90]: local X->+Z (span along the side), -Y->-X
  //   right [90,0,90]:  local X->+Z, -Y->+X
  const grooves = [
    mkGroove('Front groove', front, DRAWER_GROOVE_DEEP, W,
      [0, GROOVE_LIFT, -D / 2 + t - DRAWER_GROOVE_DEEP / 2], [90, 0, 0]),
    mkGroove('Back groove', back, DRAWER_GROOVE_DEEP, W,
      [0, GROOVE_LIFT, D / 2 - t + DRAWER_GROOVE_DEEP / 2], [-90, 0, 0]),
    mkGroove('Left groove', left, DRAWER_GROOVE_DEEP, sideLen,
      [-W / 2 + t - DRAWER_GROOVE_DEEP / 2, GROOVE_LIFT, 0], [-90, 0, -90]),
    mkGroove('Right groove', right, DRAWER_GROOVE_DEEP, sideLen,
      [W / 2 - t + DRAWER_GROOVE_DEEP / 2, GROOVE_LIFT, 0], [90, 0, 90]),
  ]

  // One slide on the outside face of each side board, front edge flush with
  // the drawer front, centered on the side's height. The mounting face is
  // the slide's local -Y, so each rotation turns -Y into its side board and
  // local X (the rail's length) along world Z.
  const slideDef = hardwareDef('drawer-slide')!
  const slideLen = Math.max(SLIDE_LEN_MIN, Math.floor(D / SLIDE_LEN_STEP) * SLIDE_LEN_STEP)
  const slideDims = { ...slideDef.defaults(units), length: slideLen }
  const slideZ = -D / 2 + slideLen / 2
  const slides = [
    mkHardware('Left slide', 'drawer-slide', { ...slideDims }, [-W / 2, H / 2, slideZ], [90, 0, 90], left),
    mkHardware('Right slide', 'drawer-slide', { ...slideDims }, [W / 2, H / 2, slideZ], [-90, 0, -90], right),
  ]

  return { parts: [front, back, left, right, bottom, ...grooves, ...slides], glue }
}

/**
 * A rail-and-stile door for the given opening: two stiles, two rails, a
 * floating ply panel in 9.5mm grooves, two cup hinges on the left stile,
 * glued as one 'Door'. Stands on the bench face-out: width along Z, height
 * up Y, thickness along X.
 */
export function buildDoor(params: DoorParams, units: UnitSystem): { parts: Part[]; glue: Glue } {
  const t = params.stock
  const sw = params.stileWidth
  const rw = params.railWidth
  const W = atLeast1(params.openingWidth + 2 * params.overlay) // finished door width
  const H = atLeast1(params.openingHeight + 2 * params.overlay) // finished door height
  const railLen = atLeast1(W - 2 * sw)

  const glue: Glue = { id: crypto.randomUUID(), name: 'Door' }
  const gid = glue.id

  // Stiles run the door's full height (Standing Up); rails fit between them.
  const leftStile = mkBoard('Left stile', H, sw, t, [0, H / 2, -(W - sw) / 2], [0, 0, 90], SOLID_COLORS[0], gid)
  const rightStile = mkBoard('Right stile', H, sw, t, [0, H / 2, (W - sw) / 2], [0, 0, 90], SOLID_COLORS[0], gid)
  const bottomRail = mkBoard('Bottom rail', railLen, rw, t, [0, rw / 2, 0], [90, 0, 90], SOLID_COLORS[1], gid)
  const topRail = mkBoard('Top rail', railLen, rw, t, [0, H - rw / 2, 0], [90, 0, 90], SOLID_COLORS[1], gid)

  // The panel floats: it reaches to PANEL_GAP short of every groove bottom
  // so the wood can move with the seasons.
  const reach = DOOR_GROOVE_DEEP - PANEL_GAP
  const panelH = atLeast1(H - 2 * rw + 2 * reach)
  const panelW = atLeast1(railLen + 2 * reach)
  const panel = mkBoard('Door panel', panelH, panelW, PLY, [0, H / 2, 0], [0, 0, 90], SOLID_COLORS[2], gid)

  // One groove along each frame member's inner edge, centered in the stock
  // thickness. Same rule as the drawer: local X along the host's length,
  // local -Y into the wood.
  //   left stile [0,90,90]:   local X->+Y (full height), -Y->-Z (into it)
  //   right stile [0,-90,90]: local X->+Y, -Y->+Z
  //   bottom rail [0,-90,0]:  local X->+Z (rail run), -Y->-Y (downward)
  //   top rail [180,90,0]:    local X->+Z, -Y->+Y (upward)
  const grooves = [
    mkGroove('Left stile groove', leftStile, DOOR_GROOVE_DEEP, H,
      [0, H / 2, -W / 2 + sw - DOOR_GROOVE_DEEP / 2], [0, 90, 90]),
    mkGroove('Right stile groove', rightStile, DOOR_GROOVE_DEEP, H,
      [0, H / 2, W / 2 - sw + DOOR_GROOVE_DEEP / 2], [0, -90, 90]),
    mkGroove('Bottom rail groove', bottomRail, DOOR_GROOVE_DEEP, railLen,
      [0, rw - DOOR_GROOVE_DEEP / 2, 0], [0, -90, 0]),
    mkGroove('Top rail groove', topRail, DOOR_GROOVE_DEEP, railLen,
      [0, H - rw + DOOR_GROOVE_DEEP / 2, 0], [180, 90, 0]),
  ]

  // Two cup hinges on the left stile, cup centers HINGE_FROM_END from each
  // end, mounted on the door's back face (+X). [-90,0,-90] turns the bores
  // (local -Y) into the stile (world -X), the screw spread (local Z)
  // vertical, and the hinge arm (local +X) inboard across the stile.
  const hingeDef = hardwareDef('cup-hinge')!
  const hingeDims = hingeDef.defaults(units)
  const cupZ = -W / 2 + CUP_FROM_EDGE
  const hinges = [
    mkHardware('Bottom hinge', 'cup-hinge', { ...hingeDims }, [t / 2, HINGE_FROM_END, cupZ], [-90, 0, -90], leftStile),
    mkHardware('Top hinge', 'cup-hinge', { ...hingeDims }, [t / 2, H - HINGE_FROM_END, cupZ], [-90, 0, -90], leftStile),
  ]

  return { parts: [leftStile, rightStile, bottomRail, topRail, panel, ...grooves, ...hinges], glue }
}
