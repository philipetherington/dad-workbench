import { describe, expect, it } from 'vitest'
import { formatLength, formatLengthBare, parseLength, snap, IN } from './units'

describe('parseLength', () => {
  it('parses mixed fractions in inch mode', () => {
    expect(parseLength('3 1/2', 'in')).toBeCloseTo(88.9, 10)
    expect(parseLength('24-1/2', 'in')).toBeCloseTo(24.5 * IN, 10)
  })

  it('parses bare decimals and fractions in inch mode', () => {
    expect(parseLength('.75', 'in')).toBeCloseTo(0.75 * IN, 10)
    expect(parseLength('7/8', 'in')).toBeCloseTo(0.875 * IN, 10)
  })

  it('parses feet suffixes', () => {
    expect(parseLength('2ft', 'in')).toBeCloseTo(609.6, 10)
    expect(parseLength("3'", 'in')).toBeCloseTo(914.4, 10)
    expect(parseLength("3'", 'mm')).toBeCloseTo(914.4, 10)
  })

  it('parses unicode vulgar fractions', () => {
    expect(parseLength('3¾', 'in')).toBeCloseTo(3.75 * IN, 10)
  })

  it('unit suffix overrides the current mode', () => {
    expect(parseLength('10mm', 'in')).toBe(10)
    expect(parseLength('4"', 'mm')).toBeCloseTo(101.6, 10)
  })

  it('bare number uses current mode', () => {
    expect(parseLength('100', 'mm')).toBe(100)
    expect(parseLength('100', 'in')).toBeCloseTo(100 * IN, 10)
  })

  it('parses negative fractions', () => {
    expect(parseLength('-1/2', 'in')).toBeCloseTo(-12.7, 10)
  })

  it('tolerates whitespace', () => {
    expect(parseLength('  3 1/2  ', 'in')).toBeCloseTo(88.9, 10)
    expect(parseLength(' 10 mm ', 'in')).toBe(10)
    expect(parseLength('3 / 4', 'in')).toBeCloseTo(0.75 * IN, 10)
  })

  it('rejects invalid input', () => {
    expect(parseLength('', 'in')).toBeNull()
    expect(parseLength('abc', 'in')).toBeNull()
    expect(parseLength('1/0', 'in')).toBeNull()
    expect(parseLength('3//4', 'in')).toBeNull()
    expect(parseLength('mm', 'mm')).toBeNull()
    expect(parseLength('"', 'in')).toBeNull()
  })
})

describe('formatLength / formatLengthBare', () => {
  it('formats inch fractions', () => {
    expect(formatLength(19.05, 'in')).toBe('3/4"')
    expect(formatLengthBare(19.05, 'in')).toBe('3/4')
    expect(formatLength(88.9, 'in')).toBe('3 1/2"')
    expect(formatLength(25.4, 'in')).toBe('1"')
    expect(formatLength(0, 'in')).toBe('0"')
    expect(formatLength(-12.7, 'in')).toBe('-1/2"')
  })

  it('formats mm mode', () => {
    expect(formatLength(88.9, 'mm')).toBe('88.9 mm')
    expect(formatLengthBare(88.9, 'mm')).toBe('88.9')
  })

  it('rounds to nearest 1/32 in inch mode', () => {
    expect(formatLength(19.0, 'in')).toBe('3/4"')
    // just past 31/32 rounds up to the next whole inch
    expect(formatLength(25.3, 'in')).toBe('1"')
  })

  it('avoids -0 in mm mode', () => {
    expect(formatLengthBare(-0.01, 'mm')).toBe('0')
  })
})

describe('snap', () => {
  it('snaps to nearest multiple of step', () => {
    expect(snap(13, 5)).toBe(15)
    expect(snap(12, 5)).toBe(10)
    expect(snap(-13, 5)).toBe(-15)
  })

  it('passes through when step <= 0', () => {
    expect(snap(13.7, 0)).toBe(13.7)
    expect(snap(13.7, -1)).toBe(13.7)
  })
})

describe('round-trips', () => {
  const cleanMm = [
    0,
    IN / 32,
    IN / 16,
    IN / 8,
    IN / 4,
    IN / 2,
    0.75 * IN,
    IN,
    3.5 * IN,
    24.5 * IN,
    -0.5 * IN,
    -1.25 * IN,
  ]
  it('parse(formatBare(x)) === x for clean inch fractions', () => {
    for (const mm of cleanMm) {
      const text = formatLengthBare(mm, 'in')
      expect(parseLength(text, 'in')).toBeCloseTo(mm, 10)
    }
  })

  it('parse(formatBare(x)) === x for clean mm values', () => {
    for (const mm of [0, 1, 0.5, 88.9, 100, -12.7]) {
      const text = formatLengthBare(mm, 'mm')
      expect(parseLength(text, 'mm')).toBe(mm)
    }
  })
})
