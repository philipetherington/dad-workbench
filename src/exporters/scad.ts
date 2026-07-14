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
  }
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
  const taken = new Set<string>()
  const solidNames = solids.map((p) => ident('piece', p.name, taken))
  const holeNames = holes.map((p) => ident('hole', p.name, taken))

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

  if (holes.length > 0 && solids.length > 0) {
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

  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}
