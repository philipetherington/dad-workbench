// Starter project templates: small, correctly-assembled example documents.
// All positions computed so parts rest on the bench (y-up) and mate flush.

import { IN } from './units'
import { HOLE_COLOR, SOLID_COLORS } from './parts'
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
]
