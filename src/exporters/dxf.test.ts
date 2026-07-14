import { describe, it, expect } from 'vitest'
import { exportDXF } from './dxf'

const square = (o: number): [number, number][] => [
  [o, o],
  [o + 10, o],
  [o + 10, o + 10],
  [o, o + 10],
]

describe('exportDXF', () => {
  const dxf = exportDXF([square(0), square(20)])

  it('puts HEADER before ENTITIES', () => {
    const header = dxf.indexOf('HEADER')
    const entities = dxf.indexOf('ENTITIES')
    expect(header).toBeGreaterThan(-1)
    expect(entities).toBeGreaterThan(header)
    expect(dxf).toContain('$ACADVER')
    expect(dxf).toContain('AC1009')
  })

  it('writes one closed POLYLINE per contour', () => {
    expect(dxf.match(/^POLYLINE$/gm)?.length).toBe(2)
    expect(dxf.match(/^SEQEND$/gm)?.length).toBe(2)
    expect(dxf.match(/70\r\n1(\r\n|$)/g)?.length).toBe(2)
    expect(dxf).toContain('66\r\n1')
  })

  it('writes one VERTEX per point', () => {
    expect(dxf.match(/^VERTEX$/gm)?.length).toBe(8)
  })

  it('uses CRLF and ends with 0 EOF', () => {
    expect(dxf.includes('\r\n')).toBe(true)
    expect(dxf.split('\r\n').filter((l) => l.includes('\n'))).toEqual([])
    expect(dxf.endsWith('0\r\nEOF')).toBe(true)
  })
})
