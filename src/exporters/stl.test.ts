import { describe, expect, it } from 'vitest'
import { exportSTL } from './stl'

// Triangle in the z=5 plane, CCW as seen from +z -> normal (0,0,1),
// plus a degenerate (zero-area) triangle.
const soup = new Float32Array([
  0, 0, 5, 10, 0, 5, 0, 10, 5,
  1, 2, 3, 1, 2, 3, 1, 2, 3,
])

describe('exportSTL', () => {
  it('produces the correct byte length and triangle count', () => {
    const buf = exportSTL(soup)
    expect(buf.byteLength).toBe(84 + 50 * 2)
    const view = new DataView(buf)
    expect(view.getUint32(80, true)).toBe(2)
  })

  it('header starts with the ASCII marker and not "solid"', () => {
    const bytes = new Uint8Array(exportSTL(soup), 0, 80)
    const text = String.fromCharCode(...bytes.subarray(0, 20))
    expect(text).toBe('Workbench STL export')
    expect(text.startsWith('solid')).toBe(false)
    // padded with zeros
    expect(bytes[20]).toBe(0)
    expect(bytes[79]).toBe(0)
  })

  it('computes the normal of a planar triangle', () => {
    const view = new DataView(exportSTL(soup))
    expect(view.getFloat32(84, true)).toBeCloseTo(0, 6)
    expect(view.getFloat32(88, true)).toBeCloseTo(0, 6)
    expect(view.getFloat32(92, true)).toBeCloseTo(1, 6)
  })

  it('writes a zero normal for a degenerate triangle', () => {
    const view = new DataView(exportSTL(soup))
    const off = 84 + 50
    expect(view.getFloat32(off, true)).toBe(0)
    expect(view.getFloat32(off + 4, true)).toBe(0)
    expect(view.getFloat32(off + 8, true)).toBe(0)
  })

  it('round-trips vertices exactly and zeroes attribute byte counts', () => {
    const view = new DataView(exportSTL(soup))
    for (let t = 0; t < 2; t++) {
      const base = 84 + 50 * t + 12
      for (let k = 0; k < 9; k++) {
        expect(view.getFloat32(base + k * 4, true)).toBe(soup[t * 9 + k])
      }
      expect(view.getUint16(84 + 50 * t + 48, true)).toBe(0)
    }
  })

  it('handles an empty soup', () => {
    const buf = exportSTL(new Float32Array(0))
    expect(buf.byteLength).toBe(84)
    expect(new DataView(buf).getUint32(80, true)).toBe(0)
  })
})
