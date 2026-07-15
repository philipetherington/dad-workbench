// Starter project templates: small, correctly-assembled example documents.
// All positions computed so parts rest on the bench (y-up) and mate flush.

import { IN } from './units'
import { HOLE_COLOR, SOLID_COLORS } from './parts'
import { hardwareDef } from './hardware'
import type { Doc, Part } from './types'

export interface Template {
  id: string
  name: string
  description: string
  build: () => Doc
}

function board(
  name: string,
  length: number,
  width: number,
  thickness: number,
  position: [number, number, number],
  rotation: [number, number, number],
  color: string,
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
  }
}

function roundHole(
  name: string,
  diameter: number,
  height: number,
  position: [number, number, number],
  rotation: [number, number, number],
): Part {
  return {
    id: crypto.randomUUID(),
    name,
    kind: 'cylinder',
    role: 'hole',
    variant: 'round-hole',
    dims: { diameter, height },
    position,
    rotation,
    color: HOLE_COLOR,
  }
}

function buildBookshelf(): Doc {
  const sideLen = 36 * IN
  const width = 10 * IN
  const thick = 0.75 * IN
  const shelfLen = 22.5 * IN
  // Standing up ([0,0,90]): worldSize = [thickness, length, width].
  const sideX = (shelfLen + thick) / 2
  const sideY = sideLen / 2

  const parts: Part[] = [
    board('Left side', sideLen, width, thick, [-sideX, sideY, 0], [0, 0, 90], SOLID_COLORS[0]),
    board('Right side', sideLen, width, thick, [sideX, sideY, 0], [0, 0, 90], SOLID_COLORS[0]),
  ]
  const shelfBottomsIn = [0, 11.625, 23.625]
  shelfBottomsIn.forEach((bottom, i) => {
    parts.push(
      board(
        `Shelf ${i + 1}`,
        shelfLen,
        width,
        thick,
        [0, bottom * IN + thick / 2, 0],
        [0, 0, 0],
        SOLID_COLORS[1],
      ),
    )
  })

  return {
    version: 1,
    name: 'Small Bookshelf',
    units: 'in',
    snapStep: IN / 16,
    parts,
    glues: [],
  }
}

function buildBracket(): Doc {
  const plateL = 100
  const plateW = 60
  const plateT = 8

  // Base plate lying flat: worldSize = [100, 8, 60].
  const base = board('Base plate', plateL, plateW, plateT, [0, plateT / 2, 0], [0, 0, 0], SOLID_COLORS[0])

  // Upright on edge ([90,0,0]): worldSize = [length, width, thickness] = [100, 60, 8].
  // Sits on top of the base, back face flush with the base's back edge (z = +30).
  const uprightY = plateT + plateW / 2
  const uprightZ = plateW / 2 - plateT / 2
  const upright = board('Upright plate', plateL, plateW, plateT, [0, uprightY, uprightZ], [90, 0, 0], SOLID_COLORS[1])

  // Gusset wedge, ramp running along Z ([0,90,0]): worldSize = [width, height, length].
  const gusLen = 30
  const gusHeight = 30
  const gusWidth = 20
  const uprightFrontZ = uprightZ - plateT / 2
  const gusset: Part = {
    id: crypto.randomUUID(),
    name: 'Gusset',
    kind: 'wedge',
    role: 'solid',
    variant: 'wedge',
    dims: { length: gusLen, width: gusWidth, height: gusHeight },
    position: [0, plateT + gusHeight / 2, uprightFrontZ - gusLen / 2],
    rotation: [0, 90, 0],
    color: SOLID_COLORS[2],
  }

  const holeD = 5
  const holeH = 30
  const inset = 12
  const hx = plateL / 2 - inset
  const hz = plateW / 2 - inset
  const parts: Part[] = [base, upright, gusset]

  // Vertical holes through the four base corners (axis Y, worldSize [5, 30, 5]).
  const corners: Array<[number, number]> = [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ]
  corners.forEach(([x, z], i) => {
    parts.push(roundHole(`Base hole ${i + 1}`, holeD, holeH, [x, plateT / 2, z], [0, 0, 0]))
  })

  // Horizontal holes through the upright ([90,0,0] turns the axis to Z; worldSize [5, 5, 30]).
  const uhy = plateT + plateW - inset
  ;[-hx, hx].forEach((x, i) => {
    parts.push(roundHole(`Upright hole ${i + 1}`, holeD, holeH, [x, uhy, uprightZ], [90, 0, 0]))
  })

  return {
    version: 1,
    name: 'Shelf Bracket',
    units: 'mm',
    snapStep: 1,
    parts,
    glues: [],
  }
}

function buildDoorstop(): Doc {
  const length = 5 * IN
  const width = 1.5 * IN
  const height = 1.25 * IN
  const wedge: Part = {
    id: crypto.randomUUID(),
    name: 'Wedge',
    kind: 'wedge',
    role: 'solid',
    variant: 'wedge',
    dims: { length, width, height },
    position: [0, height / 2, 0],
    rotation: [0, 0, 0],
    color: SOLID_COLORS[3],
  }
  return {
    version: 1,
    name: 'Door Wedge',
    units: 'in',
    snapStep: IN / 16,
    parts: [wedge],
    glues: [],
  }
}

function buildWallCabinet(): Doc {
  // A small frameless wall cabinet, all in inches:
  //   - two sides Standing Up, top and bottom captured between them
  //     (the bookshelf pattern),
  //   - a 1/4" ply back inset into 3/8 x 3/8 rabbets along each side's
  //     back inner edge,
  //   - one fixed shelf seated in 3/4 x 3/8 dados at mid-height,
  //   - two System-32 shelf-pin rows on the right side above that shelf.
  // Nothing is glued: every board stays individual for the cut list.
  const thick = 0.75 * IN
  const depth = 11.25 * IN
  const height = 30 * IN
  const innerSpan = 22.5 * IN
  const rabbetW = 0.375 * IN
  const rabbetD = 0.375 * IN
  const dadoW = 0.75 * IN
  const dadoD = 0.375 * IN
  const backT = 0.25 * IN

  const sideX = (innerSpan + thick) / 2 // side centers: 11 5/8" out
  const innerX = innerSpan / 2 // inner faces at +/- 11 1/4"
  const backZ = depth / 2 // the carcass back plane
  const midY = height / 2

  // Carcass. Sides Standing Up ([0,0,90]): worldSize = [thickness, length, width].
  const left = board('Left side', height, depth, thick, [-sideX, midY, 0], [0, 0, 90], SOLID_COLORS[0])
  const right = board('Right side', height, depth, thick, [sideX, midY, 0], [0, 0, 90], SOLID_COLORS[0])
  const bottom = board('Bottom', innerSpan, depth, thick, [0, thick / 2, 0], [0, 0, 0], SOLID_COLORS[1])
  const top = board('Top', innerSpan, depth, thick, [0, height - thick / 2, 0], [0, 0, 0], SOLID_COLORS[1])

  // Back rabbets, one per side, hugging the back inner edge. A rabbet's span
  // runs local X and its depth local Y (local -Y points into the wood), so
  // [0,0,+90] on the right side sends local X up the board (the hosted span
  // auto-follows the side's full 30" height) and local -Y into the material;
  // the left side mirrors with [0,0,-90]. dims.span is just the unhosted
  // fallback.
  function backRabbet(name: string, hostId: string, sign: 1 | -1): Part {
    return {
      id: crypto.randomUUID(),
      name,
      kind: 'rabbet',
      role: 'hole',
      variant: 'rabbet',
      dims: { width: rabbetW, deep: rabbetD, span: height },
      position: [sign * (innerX + rabbetD / 2), midY, backZ - rabbetW / 2],
      rotation: [0, 0, sign * 90],
      color: HOLE_COLOR,
      hostId,
    }
  }

  // Shelf dados at mid-height, one per side. [90,0,+/-90] runs the span
  // (local X) across the side's width (world Z, host-resolved), keeps the
  // channel width (local Z) vertical to take the shelf's thickness, and
  // points local -Y into the side from its inner face.
  function shelfDado(name: string, hostId: string, sign: 1 | -1): Part {
    return {
      id: crypto.randomUUID(),
      name,
      kind: 'dado',
      role: 'hole',
      variant: 'dado',
      dims: { width: dadoW, deep: dadoD, span: depth },
      position: [sign * (innerX + dadoD / 2), midY, 0],
      rotation: [90, 0, sign * 90],
      color: HOLE_COLOR,
      hostId,
    }
  }

  // The ply back, On Edge ([90,0,0]): worldSize = [length, width, thickness].
  // It reaches into both rabbets (ledge to ledge) and runs between the top
  // and bottom boards.
  const back = board(
    'Back panel',
    innerSpan + 2 * rabbetD,
    height - 2 * thick,
    backT,
    [0, midY, backZ - backT / 2],
    [90, 0, 0],
    SOLID_COLORS[2],
  )

  // The fixed shelf seats in both dados: inner span plus 2 x 3/8" of length.
  // It is shallower than the carcass by the rabbet width so it clears the
  // inset back; front edge flush with the carcass front.
  const shelfDepth = depth - rabbetW
  const shelf = board(
    'Fixed shelf',
    innerSpan + 2 * dadoD,
    shelfDepth,
    thick,
    [0, midY, -rabbetW / 2],
    [0, 0, 0],
    SOLID_COLORS[3],
  )

  // Two shelf-pin rows on the right side's inner face, above the fixed
  // shelf. [90,0,90] turns the hole row (local Z) vertical and the mounting
  // face (local -Y) into the side; the origin sits deep/2 into the wood so
  // the 12mm bores run their full depth from the inner face.
  const pinCatalog = hardwareDef('shelf-pin-row')!
  const pinDims = { count: 5, spacing: 32, diameter: 5, deep: 12 }
  function pinRow(name: string, z: number): Part {
    return {
      id: crypto.randomUUID(),
      name,
      kind: 'hardware',
      role: 'hardware',
      variant: 'shelf-pin-row',
      catalogId: 'shelf-pin-row',
      dims: { ...pinDims },
      position: [innerX + pinDims.deep / 2, 22.5 * IN, z],
      rotation: [90, 0, 90],
      color: pinCatalog.color,
      hostId: right.id,
    }
  }

  return {
    version: 1,
    name: 'Wall Cabinet',
    units: 'in',
    snapStep: IN / 16,
    parts: [
      left,
      right,
      bottom,
      top,
      backRabbet('Back rabbet left', left.id, -1),
      backRabbet('Back rabbet right', right.id, 1),
      back,
      shelfDado('Shelf dado left', left.id, -1),
      shelfDado('Shelf dado right', right.id, 1),
      shelf,
      pinRow('Pin row front', -4.5 * IN),
      pinRow('Pin row back', 4.5 * IN),
    ],
    glues: [],
  }
}

export const TEMPLATES: Template[] = [
  {
    id: 'bookshelf',
    name: 'Small Bookshelf',
    description: 'A three-shelf bookcase from 1x10 boards: two upright sides and three shelves.',
    build: buildBookshelf,
  },
  {
    id: 'bracket',
    name: 'Shelf Bracket (3D printable)',
    description: 'An L-bracket with a gusset and pre-placed screw holes, sized in millimeters.',
    build: buildBracket,
  },
  {
    id: 'doorstop',
    name: 'Door Wedge',
    description: 'A single wedge to hold a door open. The simplest possible project.',
    build: buildDoorstop,
  },
  {
    id: 'wall-cabinet',
    name: 'Wall Cabinet',
    description:
      'A small frameless wall cabinet showing off joinery and hardware: a rabbeted-in ply back, a fixed shelf seated in dados, and shelf-pin rows for adjustable shelves.',
    build: buildWallCabinet,
  },
]
