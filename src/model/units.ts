// Length parsing/formatting at the display boundary.
// Internally everything is mm; these helpers translate to and from what the
// user reads and types: fractional inches ('3 1/2"') or millimeters.

import type { UnitSystem } from './types'

export const IN = 25.4

/** Finest fraction shown or snapped to in inch mode. */
export const INCH_DENOM = 32

export interface SnapOption {
  label: string
  mm: number
}

export const SNAP_OPTIONS: Record<UnitSystem, SnapOption[]> = {
  in: [
    { label: '1/32"', mm: IN / 32 },
    { label: '1/16"', mm: IN / 16 },
    { label: '1/8"', mm: IN / 8 },
    { label: '1/4"', mm: IN / 4 },
    { label: '1"', mm: IN },
  ],
  mm: [
    { label: '0.5 mm', mm: 0.5 },
    { label: '1 mm', mm: 1 },
    { label: '5 mm', mm: 5 },
    { label: '10 mm', mm: 10 },
  ],
}

export const DEFAULT_SNAP: Record<UnitSystem, number> = {
  in: IN / 16,
  mm: 1,
}

/** Reduce a fraction num/den to lowest terms. */
function reduce(num: number, den: number): [number, number] {
  while (num % 2 === 0 && den % 2 === 0) {
    num /= 2
    den /= 2
  }
  return [num, den]
}

/**
 * Format a length in mm for display.
 * inch mode: nearest 1/32, e.g. '3 1/2"', '3/4"', '0"', '-1 1/4"'
 * mm mode: one decimal, e.g. '88.9 mm'
 */
export function formatLength(mm: number, units: UnitSystem): string {
  return units === 'in' ? `${formatLengthBare(mm, units)}"` : `${formatLengthBare(mm, units)} mm`
}

/** Same as formatLength but without the unit suffix (for input fields). */
export function formatLengthBare(mm: number, units: UnitSystem): string {
  if (units === 'mm') {
    const v = Math.round(mm * 10) / 10
    // avoid '-0'
    return (Object.is(v, -0) ? 0 : v).toString()
  }
  const sign = mm < 0 ? '-' : ''
  const inches = Math.abs(mm) / IN
  let whole = Math.floor(inches)
  let num = Math.round((inches - whole) * INCH_DENOM)
  if (num === INCH_DENOM) {
    whole += 1
    num = 0
  }
  if (num === 0) return `${sign}${whole}`
  const [n, d] = reduce(num, INCH_DENOM)
  if (whole === 0) return `${sign}${n}/${d}`
  return `${sign}${whole} ${n}/${d}`
}

/**
 * Parse user-typed length into mm, or null if unparseable.
 * Accepts: '3', '3.5', '3 1/2', '7/8', '3-1/2', with optional suffix
 * ('"', 'in', 'mm') that overrides the current unit system.
 * A bare number is interpreted in the given unit system.
 */
const VULGAR: Record<string, string> = {
  '¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4',
  '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8',
  '⅓': ' 1/3', '⅔': ' 2/3',
  '⅕': ' 1/5', '⅖': ' 2/5', '⅗': ' 3/5', '⅘': ' 4/5',
  '⅙': ' 1/6', '⅚': ' 5/6',
}

export function parseLength(text: string, units: UnitSystem): number | null {
  let s = text.trim().toLowerCase()
  if (s === '') return null

  // unicode fractions: '3¾' -> '3 3/4'
  s = s.replace(/[¼½¾⅛⅜⅝⅞⅓⅔⅕⅖⅗⅘⅙⅚]/g, (ch) => VULGAR[ch]).trim()

  let system: UnitSystem = units
  let feet = false
  if (s.endsWith('mm')) {
    system = 'mm'
    s = s.slice(0, -2).trim()
  } else if (s.endsWith('cm')) {
    system = 'mm'
    s = s.slice(0, -2).trim()
    // handled below via feet-style multiplier
    return multiplyParsed(s, 10)
  } else if (s.endsWith('ft') || s.endsWith("'")) {
    system = 'in'
    feet = true
    s = (s.endsWith('ft') ? s.slice(0, -2) : s.slice(0, -1)).trim()
  } else if (s.endsWith('in')) {
    system = 'in'
    s = s.slice(0, -2).trim()
  } else if (s.endsWith('"') || s.endsWith('″') || s.endsWith('”')) {
    system = 'in'
    s = s.slice(0, -1).trim()
  }
  if (s === '') return null
  if (feet) {
    const v = parseNumber(s)
    return v === null ? null : v * 12 * IN
  }

  const value = parseNumber(s)
  if (value === null) return null
  return system === 'in' ? value * IN : value
}

/** Parse a plain, mixed, or fractional number: '3', '3.5', '.75', '7/8', '3 1/2', '3-1/2'. */
function parseNumber(input: string): number | null {
  let s = input.trim()
  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim()
  }

  let value: number
  let m = s.match(/^(\d+(?:\.\d+)?)[ -](\d+)\s*\/\s*(\d+)$/)
  if (m) {
    const den = Number(m[3])
    if (den === 0) return null
    value = Number(m[1]) + Number(m[2]) / den
  } else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) {
    const den = Number(m[2])
    if (den === 0) return null
    value = Number(m[1]) / den
  } else if ((m = s.match(/^(\d*\.?\d+)$/))) {
    value = Number(m[1])
  } else {
    return null
  }

  if (!Number.isFinite(value)) return null
  return sign * value
}

function multiplyParsed(s: string, factor: number): number | null {
  const v = parseNumber(s)
  return v === null ? null : v * factor
}

/** Snap a mm value to the nearest multiple of step (step in mm). */
export function snap(mm: number, step: number): number {
  if (step <= 0) return mm
  return Math.round(mm / step) * step
}
