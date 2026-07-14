// Minimal ASCII DXF R12 exporter: closed 2D contours (mm) -> POLYLINE entities.

function num(v: number): string {
  let s = v.toFixed(6)
  // trim trailing zeros but keep at least one decimal-free integer form
  s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  if (s === '-0') s = '0'
  return s
}

export function exportDXF(contours: [number, number][][]): string {
  const lines: string[] = []
  const push = (code: number, value: string) => {
    lines.push(String(code), value)
  }

  push(0, 'SECTION')
  push(2, 'HEADER')
  push(9, '$ACADVER')
  push(1, 'AC1009')
  push(0, 'ENDSEC')

  push(0, 'SECTION')
  push(2, 'ENTITIES')
  for (const contour of contours) {
    push(0, 'POLYLINE')
    push(8, '0')
    push(66, '1')
    push(70, '1')
    for (const [x, y] of contour) {
      push(0, 'VERTEX')
      push(8, '0')
      push(10, num(x))
      push(20, num(y))
      push(30, '0.0')
    }
    push(0, 'SEQEND')
  }
  push(0, 'ENDSEC')

  push(0, 'EOF')
  return lines.join('\r\n')
}
