// Left panel: ADD A PIECE · CUT A HOLE · YOUR PIECES (the cut list forming).

import type { Part } from '../model/types'
import { DIM_SPECS } from '../model/types'
import { formatLengthBare } from '../model/units'
import { SOLID_ITEMS, HOLE_ITEMS } from '../model/parts'
import { useStore } from '../model/store'
import { useBus } from '../viewport/bus'
import { ShapeIcon, EyeIcon, PinIcon } from './Icons'

function dimSummary(part: Part, units: 'in' | 'mm'): string {
  return DIM_SPECS[part.kind]
    .map((s) => formatLengthBare(part.dims[s.key], units))
    .join(' × ')
}

function PieceRow({ part }: { part: Part }) {
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const toggleLock = useStore((s) => s.toggleLock)
  const setHoveredId = useBus((s) => s.setHoveredId)
  const camera = useBus((s) => s.camera)
  const selected = selection.includes(part.id)
  const glue = part.glueId ? doc.glues.find((g) => g.id === part.glueId) : null

  return (
    <div
      className={`wb-piece-row${selected ? ' selected' : ''}`}
      onClick={() => select([part.id])}
      onDoubleClick={() => camera?.focusOn(part.id)}
      onMouseEnter={() => setHoveredId(part.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => select([part.id], true)}
        aria-label={`select ${part.name}`}
      />
      <span
        className={`swatch${part.role === 'hole' ? ' hole' : ''}`}
        style={part.role === 'solid' ? { background: part.color } : undefined}
      />
      <span className="name">
        {part.name}
        {glue ? ` · ${glue.name}` : ''}
        <span className="dims" style={{ display: 'block' }}>
          {dimSummary(part, doc.units)}
        </span>
      </span>
      <button
        className={`pin${part.locked ? ' on' : ''}`}
        title={part.locked ? 'Held in place — click to let it move' : 'Hold in place'}
        onClick={(e) => {
          e.stopPropagation()
          toggleLock([part.id])
        }}
      >
        <PinIcon />
      </button>
    </div>
  )
}

export function LeftPanel() {
  const doc = useStore((s) => s.doc)
  const addPart = useStore((s) => s.addPart)
  const showCutouts = useBus((s) => s.showCutouts)
  const setShowCutouts = useBus((s) => s.setShowCutouts)
  const result = useBus((s) => s.result)

  const solids = doc.parts.filter((p) => p.role === 'solid')
  const holes = doc.parts.filter((p) => p.role === 'hole')
  const idleHoles = new Set(result?.idleHoles ?? [])

  return (
    <div className="wb-left">
      <div className="wb-section-title">ADD A PIECE</div>
      <div className="wb-shape-grid">
        {SOLID_ITEMS.map((item) => (
          <button key={item.id} className="wb-shape-btn" onClick={() => addPart(item)}>
            <ShapeIcon id={item.id} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="wb-section-title cut">CUT A HOLE</div>
      <div className="wb-shape-grid">
        {HOLE_ITEMS.map((item) => (
          <button
            key={item.id}
            className="wb-shape-btn"
            onClick={() => {
              // a brand-new hole must never arrive invisible
              if (!showCutouts) setShowCutouts(true)
              addPart(item)
            }}
          >
            <ShapeIcon id={item.id} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="wb-section-title">YOUR PIECES</div>
      <div className="wb-pieces">
        {solids.length === 0 && holes.length === 0 && (
          <div className="wb-hint">Click a shape above to put your first piece on the bench.</div>
        )}
        {solids.map((p) => (
          <PieceRow key={p.id} part={p} />
        ))}
      </div>

      {holes.length > 0 && (
        <>
          <div className="wb-eye-row">
            <div className="wb-section-title" style={{ margin: 0 }}>
              CUTOUTS
            </div>
            <button
              className="wb-btn small"
              onClick={() => setShowCutouts(!showCutouts)}
              title={showCutouts ? 'Hide the cutout shapes (they keep cutting)' : 'Show the cutout shapes'}
            >
              <EyeIcon open={showCutouts} /> {showCutouts ? 'Showing' : 'Hidden'}
            </button>
          </div>
          <div className="wb-pieces">
            {holes.map((p) => (
              <div key={p.id}>
                <PieceRow part={p} />
                {idleHoles.has(p.id) && (
                  <div className="wb-hint" style={{ paddingLeft: 8 }}>
                    Not cutting anything yet — slide it into a piece of wood.
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
