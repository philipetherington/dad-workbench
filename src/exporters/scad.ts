// OpenSCAD (.scad) exporter.
//
// Emits readable, hand-editable code: one named module per piece, the same
// solids-minus-holes structure the app uses, sizes in mm with inch-fraction
// comments when the project is in inches.
//
// Axis conventions: the document is y-up; OpenSCAD viewers expect z-up, so the
// whole model is wrapped in one rotate([90,0,0]). Part rotations are Euler XYZ
// with R = Rx·Ry·Rz, which in OpenSCAD's child-transform order is written
// rotate(X) rotate(Y) rotate(Z) <primitive>.

import type { Doc, Part } from '../model/types'
import { edgeProfileIndex, effectiveSpan, hostOf, tenonBodySize } from '../model/types'
import { hardwareDef } from '../model/hardware'
import { formatLength } from '../model/units'

function num(v: number): string {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? '0' : r.toString()
}

function ident(prefix: string, name: string, taken: Set<string>): string {
  let base = `${prefix}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
  if (!/^[a-z]/.test(base)) base = `${prefix}_piece`
  let id = base
  let n = 2
  while (taken.has(id)) id = `${base}_${n++}`
  taken.add(id)
  return id
}

/** '609.6, 19.05, 139.7' with an inch comment when in inch mode. */
function dimComment(doc: Doc, values: number[]): string {
  if (doc.units !== 'in') return ''
  return ` // ${values.map((v) => formatLength(v, 'in')).join(' × ')}`
}

function primitive(doc: Doc, part: Part): string[] {
  const d = part.dims
  switch (part.kind) {
    case 'board':
      return [
        `cube([${num(d.length)}, ${num(d.thickness)}, ${num(d.width)}], center = true);` +
          dimComment(doc, [d.length, d.thickness, d.width]),
      ]
    case 'cylinder':
      return [
        `rotate([-90, 0, 0]) cylinder(h = ${num(d.height)}, d = ${num(d.diameter)}, center = true);` +
          dimComment(doc, [d.diameter, d.height]),
      ]
    case 'sphere':
      return [`sphere(d = ${num(d.diameter)});` + dimComment(doc, [d.diameter])]
    case 'cone':
      return [
        `rotate([-90, 0, 0]) cylinder(h = ${num(d.height)}, d1 = ${num(d.diameter)}, d2 = ${num(
          d.topDiameter,
        )}, center = true);` + dimComment(doc, [d.diameter, d.topDiameter, d.height]),
      ]
    case 'wedge': {
      const l = num(d.length)
      const h = num(d.height)
      return [
        `linear_extrude(height = ${num(d.width)}, center = true)` + dimComment(doc, [d.length, d.height, d.width]),
        `  polygon(points = [[-${l} / 2, -${h} / 2], [${l} / 2, -${h} / 2], [-${l} / 2, ${h} / 2]]);`,
      ]
    }
    case 'slot': {
      // same clamp as engine/evaluate.ts: a slot can never be wider than long
      const w = Math.min(d.width, d.length)
      const straight = d.length - w
      return [
        `rotate([-90, 0, 0]) hull() {` + dimComment(doc, [d.length, w, d.deep]),
        `  translate([-${num(straight / 2)}, 0, 0]) cylinder(h = ${num(d.deep)}, d = ${num(w)}, center = true);`,
        `  translate([${num(straight / 2)}, 0, 0]) cylinder(h = ${num(d.deep)}, d = ${num(w)}, center = true);`,
        `}`,
      ]
    }
    case 'dado':
    case 'groove':
    case 'rabbet': {
      // hosted cutters resolve their span from the host exactly like the
      // engine does (effectiveSpan); unhosted ones use dims.span
      const span = effectiveSpan(doc, part)
      return [
        `cube([${num(span)}, ${num(d.deep)}, ${num(d.width)}], center = true);` +
          dimComment(doc, [span, d.deep, d.width]),
      ]
    }
    case 'tenon': {
      // removed material: body box minus the tongue (tongue runs 1mm long so
      // the difference has no coplanar end faces)
      const [bodyT, bodyW] = tenonBodySize(part, hostOf(doc, part))
      return [
        `difference() {` + dimComment(doc, [d.length, d.tongueThickness, d.tongueWidth]),
        `  cube([${num(d.length)}, ${num(bodyT)}, ${num(bodyW)}], center = true);`,
        `  cube([${num(d.length + 1)}, ${num(d.tongueThickness)}, ${num(d.tongueWidth)}], center = true);`,
        `}`,
      ]
    }
    case 'edge-profile': {
      // same construction as the engine: profile drawn with 2D x -> local Z
      // and 2D y -> local Y, extruded along +Z, then rotate([0,-90,0]) so the
      // prism runs along X; quarter circles become 24-segment polygon arcs
      const span = effectiveSpan(doc, part)
      const pts = edgeProfilePolygon(d.size, edgeProfileIndex(d.profile))
      return [
        `rotate([0, -90, 0]) linear_extrude(height = ${num(span)}, center = true)` +
          dimComment(doc, [d.size, d.size, span]),
        `  polygon(points = [${pts.map(([x, y]) => `[${num(x)}, ${num(y)}]`).join(', ')}]);`,
      ]
    }
    case 'hardware':
      // hardware bodies never export (they're bought, not made) — their
      // BORES are emitted separately, see hardwareCutterModule
      return []
  }
}

/**
 * 2D outline of the material an edge profile removes, in the plane described
 * above (x -> local Z, y -> local Y); the profiled corner is at (+size/2,
 * +size/2). CCW winding, quarter arcs approximated with 24 segments.
 */
function edgeProfilePolygon(size: number, which: 0 | 1 | 2): [number, number][] {
  const h = size / 2
  const arc = (cx: number, cy: number, fromDeg: number, toDeg: number): [number, number][] => {
    const SEG = 24
    const pts: [number, number][] = []
    for (let i = 0; i <= SEG; i++) {
      const a = ((fromDeg + ((toDeg - fromDeg) * i) / SEG) * Math.PI) / 180
      pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)])
    }
    return pts
  }
  switch (which) {
    case 1:
      // chamfer: the 45° corner triangle
      return [
        [-h, h],
        [h, -h],
        [h, h],
      ]
    case 2:
      // cove: the quarter disc centered on the profiled corner
      return [[h, h], ...arc(h, h, 180, 270)]
    default:
      // roundover: corner square minus the quarter disc about the inner
      // corner (arc endpoints coincide with square corners — sliced off)
      return [
        [h, -h],
        [h, h],
        [-h, h],
        ...arc(-h, -h, 90, 0).slice(1, -1),
      ]
  }
}

/** The bores a hardware item makes, as one module: part transform outside, each cutter's local transform inside. */
function hardwareCutterModule(doc: Doc, part: Part, name: string): string | null {
  const def = hardwareDef(part.catalogId)
  if (!def) return null
  const specs = def.cutters(part.dims)
  const [px, py, pz] = part.position
  const [rx, ry, rz] = part.rotation
  const outer: string[] = []
  if (px !== 0 || py !== 0 || pz !== 0) outer.push(`translate([${num(px)}, ${num(py)}, ${num(pz)}])`)
  if (rx !== 0) outer.push(`rotate([${num(rx)}, 0, 0])`)
  if (ry !== 0) outer.push(`rotate([0, ${num(ry)}, 0])`)
  if (rz !== 0) outer.push(`rotate([0, 0, ${num(rz)}])`)

  const lines = [`module ${name}() { // ${part.name} — bores only`]
  lines.push(`  ${outer.length ? outer.join(' ') + ' ' : ''}union() {`)
  for (const spec of specs) {
    const inner: string[] = []
    const [sx, sy, sz] = spec.position
    const [srx, sry, srz] = spec.rotation ?? [0, 0, 0]
    if (sx !== 0 || sy !== 0 || sz !== 0) inner.push(`translate([${num(sx)}, ${num(sy)}, ${num(sz)}])`)
    if (srx !== 0) inner.push(`rotate([${num(srx)}, 0, 0])`)
    if (sry !== 0) inner.push(`rotate([0, ${num(sry)}, 0])`)
    if (srz !== 0) inner.push(`rotate([0, 0, ${num(srz)}])`)
    const prim = primitive(doc, { kind: spec.kind, dims: spec.dims } as Part)
    lines.push(`    ${inner.length ? inner.join(' ') + ' ' : ''}${prim[0] ?? ''}`)
    lines.push(...prim.slice(1).map((l) => `    ${l}`))
  }
  lines.push('  }')
  lines.push('}')
  return lines.join('\n')
}

function partModule(doc: Doc, part: Part, name: string): string {
  const [px, py, pz] = part.position
  const [rx, ry, rz] = part.rotation
  const transforms: string[] = []
  if (px !== 0 || py !== 0 || pz !== 0) transforms.push(`translate([${num(px)}, ${num(py)}, ${num(pz)}])`)
  if (rx !== 0) transforms.push(`rotate([${num(rx)}, 0, 0])`)
  if (ry !== 0) transforms.push(`rotate([0, ${num(ry)}, 0])`)
  if (rz !== 0) transforms.push(`rotate([0, 0, ${num(rz)}])`)
  const prim = primitive(doc, part)
  const lines = [`module ${name}() { // ${part.name}`]
  if (transforms.length > 0) {
    lines.push(`  ${transforms.join(' ')}`)
    lines.push(...prim.map((l) => `    ${l}`))
  } else {
    lines.push(...prim.map((l) => `  ${l}`))
  }
  lines.push('}')
  return lines.join('\n')
}

export function exportSCAD(doc: Doc): string {
  const solids = doc.parts.filter((p) => p.role === 'solid')
  const holes = doc.parts.filter((p) => p.role === 'hole')
  // hardware items with bores cut wood too (a cup hinge IS its 35mm bore)
  const hardware = doc.parts.filter(
    (p) => p.kind === 'hardware' && (hardwareDef(p.catalogId)?.cutters(p.dims).length ?? 0) > 0,
  )
  const taken = new Set<string>()
  const solidNames = solids.map((p) => ident('piece', p.name, taken))
  const holeNames = [
    ...holes.map((p) => ident('hole', p.name, taken)),
    ...hardware.map((p) => ident('hole', p.name, taken)),
  ]

  const out: string[] = [
    `// ${doc.name}`,
    `// Exported from Workbench — all sizes in millimeters${doc.units === 'in' ? ' (inch sizes in comments)' : ''}`,
    '',
    '$fa = 4;',
    '$fs = 0.4;',
    '',
    '// Workbench models are y-up; OpenSCAD is z-up.',
    'rotate([90, 0, 0]) workbench_model();',
    '',
    'module workbench_model() {',
  ]

  if (holeNames.length > 0 && solids.length > 0) {
    out.push('  difference() {')
    if (solids.length > 1) out.push('    union() {')
    const indent = solids.length > 1 ? '      ' : '    '
    for (const n of solidNames) out.push(`${indent}${n}();`)
    if (solids.length > 1) out.push('    }')
    for (const n of holeNames) out.push(`    ${n}();`)
    out.push('  }')
  } else {
    for (const n of solidNames) out.push(`  ${n}();`)
  }
  out.push('}')
  out.push('')

  solids.forEach((p, i) => {
    out.push(partModule(doc, p, solidNames[i]))
    out.push('')
  })
  holes.forEach((p, i) => {
    out.push(partModule(doc, p, holeNames[i]))
    out.push('')
  })
  hardware.forEach((p, i) => {
    const mod = hardwareCutterModule(doc, p, holeNames[holes.length + i])
    if (mod) {
      out.push(mod)
      out.push('')
    }
  })

  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}
