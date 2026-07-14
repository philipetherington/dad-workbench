// The dimension field: typing fractional sizes is the app's PRIMARY sizing
// method, so this field is deliberately forgiving. Accepts '24 1/2',
// '24-1/2', '24.5', '3/4', '2ft', '¾'; echoes the parsed value live; on a
// bad entry it shakes, explains, and keeps the old value — never 0, never NaN.

import { useEffect, useRef, useState } from 'react'
import type { UnitSystem } from '../model/types'
import { formatLength, formatLengthBare, parseLength, snap } from '../model/units'

interface Props {
  label: string
  mm: number
  units: UnitSystem
  step: number
  min?: number
  onCommit: (mm: number) => void
  autoFocus?: boolean
}

export function DimField({ label, mm, units, step, min = 0.5, onCommit, autoFocus }: Props) {
  const [text, setText] = useState(() => formatLengthBare(mm, units))
  const [editing, setEditing] = useState(false)
  const [bad, setBad] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  // reflect outside changes (handle drags, undo) while not editing
  useEffect(() => {
    if (!editing) setText(formatLengthBare(mm, units))
  }, [mm, units, editing])

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [autoFocus])

  const parsed = editing ? parseLength(text, units) : null
  const echo =
    editing && parsed !== null && Math.abs(parsed - mm) > 0.001
      ? `= ${formatLength(Math.max(parsed, min), units)}`
      : ''

  const commit = () => {
    setEditing(false)
    // Escape means "never mind" — restore, commit nothing.
    if (cancelRef.current) {
      cancelRef.current = false
      setText(formatLengthBare(mm, units))
      return
    }
    // Unchanged text commits nothing: the display is rounded to 1/32", and
    // re-committing it would silently alter a precise value.
    if (text.trim() === formatLengthBare(mm, units)) return
    const v = parseLength(text, units)
    if (v === null || v < 0) {
      setBad(true)
      setText(formatLengthBare(mm, units))
      setTimeout(() => setBad(false), 1600)
      return
    }
    onCommit(Math.max(v, min))
  }

  const bump = (dir: 1 | -1) => {
    const next = Math.max(snap(mm + dir * step, step), min)
    onCommit(next)
  }

  return (
    <div>
      <div className="wb-field-label">{label}</div>
      <div className="wb-dim-row">
        <button className="wb-stepper" aria-label={`${label} smaller`} onClick={() => bump(-1)}>
          −
        </button>
        <input
          ref={inputRef}
          className={`wb-dim-input${bad ? ' bad' : ''}`}
          value={text}
          onChange={(e) => {
            setEditing(true)
            setText(e.target.value)
          }}
          onFocus={(e) => {
            setEditing(true)
            e.target.select()
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              cancelRef.current = true
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          inputMode="text"
          spellCheck={false}
        />
        <button className="wb-stepper" aria-label={`${label} bigger`} onClick={() => bump(1)}>
          +
        </button>
      </div>
      <div className={`wb-hint${bad ? ' bad' : ''}`}>
        {bad ? 'Type it like 3/4 or 1 1/2' : echo || (units === 'in' ? 'inches' : 'millimeters')}
      </div>
    </div>
  )
}
