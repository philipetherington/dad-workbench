// Right panel: "THIS PIECE" when one is chosen, group actions for several,
// a project summary when none. One flat column — nothing collapses.

import type { Part } from '../model/types'
import { dimLabel, dimSpecsFor, worldSize } from '../model/types'
import { IN, formatLength } from '../model/units'
import { useStore, withAttached } from '../model/store'
import type { LineUpMode } from '../model/store'
import { useBus } from '../viewport/bus'
import {
  applyFlip,
  applyPostureToGroup,
  applyRotationToGroup,
  POSTURES,
  turnAxis,
} from '../model/rotate'
import { DimField } from './DimField'
import { autoAttach } from './attach'
import {
  ArrowIcon,
  FlipIcon,
  PinIcon,
  PostureIcon,
  SpinIcon,
  TiltIcon,
  TipIcon,
} from './Icons'

const THICKNESS_PRESETS: { label: string; mm: number }[] = [
  { label: '1/4 ply', mm: 0.25 * IN },
  { label: '1/2 ply', mm: 0.5 * IN },
  { label: '3/4 ply', mm: 0.75 * IN },
  { label: '1x (3/4)', mm: 0.75 * IN },
  { label: '2x (1-1/2)', mm: 1.5 * IN },
]

const DRILL_SIZES_IN = ['1/8', '3/16', '1/4', '5/16', '3/8', '1/2', '5/8', '3/4', '1', '1-1/4', '2-1/8']
const DRILL_FRACTION_MM: Record<string, number> = {
  '1/8': IN / 8, '3/16': (3 * IN) / 16, '1/4': IN / 4, '5/16': (5 * IN) / 16,
  '3/8': (3 * IN) / 8, '1/2': IN / 2, '5/8': (5 * IN) / 8, '3/4': (3 * IN) / 4,
  '1': IN, '1-1/4': 1.25 * IN, '2-1/8': 2.125 * IN,
}
const DRILL_SIZES_MM = [3, 4, 5, 6, 8, 10, 12, 16, 20]

const ANGLE_DETENTS = [0, 15, 22.5, 30, 45, 60, 90]

function SummaryPanel() {
  const doc = useStore((s) => s.doc)
  const result = useBus((s) => s.result)
  const solids = doc.parts.filter((p) => p.role === 'solid')
  const holes = doc.parts.filter((p) => p.role === 'hole')

  let sizeLine = ''
  if (result && result.parts.length > 0) {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const p of result.parts) {
      if (p.role !== 'solid') continue // cutout ghosts aren't part of the piece
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p.bbox.min[i])
        max[i] = Math.max(max[i], p.bbox.max[i])
      }
    }
    if (Number.isFinite(min[0])) {
      sizeLine = `${formatLength(max[0] - min[0], doc.units)} wide · ${formatLength(
        max[1] - min[1],
        doc.units,
      )} tall · ${formatLength(max[2] - min[2], doc.units)} deep`
    }
  }

  return (
    <div className="wb-right">
      <div className="wb-section-title">THIS PROJECT</div>
      <div className="wb-note">
        {solids.length === 0 && holes.length === 0
          ? 'The bench is empty. Click a shape on the left to get started.'
          : `${solids.length} piece${solids.length === 1 ? '' : 's'}${
              holes.length > 0 ? ` and ${holes.length} cutout${holes.length === 1 ? '' : 's'}` : ''
            }.`}
      </div>
      {sizeLine && <div className="wb-hint">Overall: {sizeLine}</div>}
      <div className="wb-hint">Click a piece to change it.</div>
    </div>
  )
}

function MultiPanel() {
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const store = useStore
  const result = useBus((s) => s.result)
  const parts = doc.parts.filter((p) => selection.includes(p.id))
  const solids = parts.filter((p) => p.role === 'solid')
  const gluedIds = new Set(parts.filter((p) => p.glueId).map((p) => p.glueId!))

  const bboxes: Record<string, { min: [number, number, number]; max: [number, number, number] }> = {}
  for (const p of result?.parts ?? []) bboxes[p.id] = p.bbox

  const lineUp = (mode: LineUpMode) => store.getState().lineUp(mode, bboxes)

  const removeThese = () => {
    const n = parts.length
    store.getState().deleteSelection()
    useBus.getState().toast(`Removed ${n} pieces`, 'Put Them Back', () => store.getState().undo())
  }

  return (
    <div className="wb-right">
      <div className="wb-section-title">{parts.length} PIECES CHOSEN</div>

      <div className="wb-group">
        <div className="wb-field-label">Line up…</div>
        <div className="wb-btn-grid-3">
          <button className="wb-btn small" onClick={() => lineUp('left')}>Flush Left</button>
          <button className="wb-btn small" onClick={() => lineUp('centerAcross')}>Center</button>
          <button className="wb-btn small" onClick={() => lineUp('right')}>Flush Right</button>
          <button className="wb-btn small" onClick={() => lineUp('back')}>Flush Back</button>
          <button className="wb-btn small" onClick={() => lineUp('centerDeep')}>Middle</button>
          <button className="wb-btn small" onClick={() => lineUp('front')}>Flush Front</button>
        </div>
        <button className="wb-btn small wide" onClick={() => lineUp('even')} disabled={parts.length < 3}>
          Even Spacing
        </button>
      </div>

      <div className="wb-group">
        {solids.length >= 2 && (
          <button
            className="wb-btn wide"
            onClick={() => {
              store.getState().glueSelection()
              useBus
                .getState()
                .toast(`Glued ${solids.length} pieces into one`, 'Take Apart', () =>
                  store.getState().undo(),
                )
            }}
          >
            Glue Together
          </button>
        )}
        {gluedIds.size > 0 && (
          <button className="wb-btn wide" onClick={() => store.getState().unglue([...gluedIds])}>
            Take Apart
          </button>
        )}
        <button className="wb-btn wide" onClick={() => store.getState().duplicateSelection()}>
          Copy These
        </button>
        <button className="wb-btn danger wide" onClick={removeThese}>
          Remove These
        </button>
      </div>
    </div>
  )
}

function SinglePanel({ part }: { part: Part }) {
  const doc = useStore((s) => s.doc)
  const store = useStore
  const camera = useBus((s) => s.camera)
  const result = useBus((s) => s.result)

  const bbox = result?.parts.find((p) => p.id === part.id)?.bbox
  const airborne = bbox ? bbox.min[1] > 0.5 : false
  const overlapping = (result?.overlaps ?? []).some(([a, b]) => a === part.id || b === part.id)
  const cutAway = (result?.emptySolids ?? []).includes(part.id)
  const idle = (result?.idleHoles ?? []).includes(part.id)

  const updateThis = (fn: (p: Part) => void) => store.getState().updateParts([part.id], fn)

  /** Rotate this piece AND whatever is attached to it, as one rigid body. */
  const withGroup = (fn: (host: Part, children: Part[]) => void) => {
    store.getState().mutate((d) => {
      const host = d.parts.find((q) => q.id === part.id)
      if (!host) return
      const kidIds = withAttached(d, [host.id]).filter((i) => i !== host.id)
      const children = d.parts.filter((q) => kidIds.includes(q.id))
      fn(host, children)
    })
  }

  const turn = (kind: 'turn' | 'tip' | 'tilt', degrees: number) => {
    const yaw = camera?.yawDeg() ?? 0
    const axis = turnAxis(kind, yaw)
    withGroup((host, children) => applyRotationToGroup(host, children, axis, degrees))
  }

  const removeThis = () => {
    const name = part.name
    store.getState().deleteSelection()
    useBus.getState().toast(`Removed '${name}'`, 'Put It Back', () => store.getState().undo())
  }

  const isBoardish = part.kind === 'board' || part.kind === 'wedge'
  const isRoundHole = part.kind === 'cylinder' && part.role === 'hole'

  return (
    <div className="wb-right">
      <div className="wb-section-title">THIS PIECE</div>
      <input
        className="wb-project-name"
        style={{ maxWidth: 'none', fontSize: 18 }}
        value={part.name}
        onChange={(e) =>
          // no history: renaming shouldn't cost one undo step per keystroke
          store.getState().updateParts([part.id], (p) => (p.name = e.target.value), { history: false })
        }
        spellCheck={false}
      />

      {part.role !== 'hardware' && (
        <div className="wb-role-switch">
          <button
            className={`wb-role-card solid${part.role === 'solid' ? ' on' : ''}`}
            onClick={() => updateThis((p) => (p.role = 'solid'))}
          >
            Solid wood
            <span className="sub">a piece you keep</span>
          </button>
          <button
            className={`wb-role-card hole${part.role === 'hole' ? ' on' : ''}`}
            onClick={() => {
              if (part.role !== 'hole' && !localStorage.getItem('workbench-hole-explained')) {
                localStorage.setItem('workbench-hole-explained', '1')
                useBus
                  .getState()
                  .toast('This piece now cuts wood away wherever it touches another piece.')
              }
              updateThis((p) => (p.role = 'hole'))
            }}
          >
            Cuts wood away
            <span className="sub">a hole or notch</span>
          </button>
        </div>
      )}
      {part.role === 'hardware' && (
        <div className="wb-note">
          Hardware you buy — it bores its own holes in the wood it sits on, and joins the
          shopping list.
        </div>
      )}

      {part.hostId && (
        <div className="wb-note">
          Attached to <strong>{doc.parts.find((p) => p.id === part.hostId)?.name ?? 'a piece'}</strong>{' '}
          — it moves and turns with it.
          <div style={{ marginTop: 8 }}>
            <button className="wb-btn small" onClick={() => store.getState().attachPart(part.id, null)}>
              Let it move on its own
            </button>
          </div>
        </div>
      )}

      {cutAway && (
        <div className="wb-note bad">
          The cutouts cut away all of this piece — slide them apart or undo.
        </div>
      )}
      {overlapping && (
        <div className="wb-note warn">
          This piece overlaps another solid piece. Real boards can't share space — slide one
          until they sit flush.
        </div>
      )}
      {idle && (
        <div className="wb-note">
          This hole isn't cutting anything yet — slide it into a piece of wood.
        </div>
      )}

      <div className="wb-group">
        <div className="wb-field-label">MEASUREMENTS</div>
        {dimSpecsFor(part).map((spec) =>
          spec.integer ? (
            <div key={spec.key}>
              <div className="wb-field-label">{spec.label}</div>
              <div className="wb-dim-row">
                <button
                  className="wb-stepper"
                  onClick={() =>
                    store
                      .getState()
                      .updatePartDims(part.id, { [spec.key]: Math.max(spec.min, part.dims[spec.key] - 1) })
                  }
                >
                  −
                </button>
                <div className="wb-dim-input" style={{ lineHeight: '32px' }}>
                  {Math.round(part.dims[spec.key])}
                </div>
                <button
                  className="wb-stepper"
                  onClick={() =>
                    store.getState().updatePartDims(part.id, { [spec.key]: part.dims[spec.key] + 1 })
                  }
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <DimField
              key={spec.key}
              label={dimLabel(part, spec.key)}
              mm={part.dims[spec.key]}
              units={doc.units}
              step={doc.snapStep}
              min={spec.min}
              onCommit={(mm) => store.getState().updatePartDims(part.id, { [spec.key]: mm })}
            />
          ),
        )}
        {part.kind === 'board' && part.role === 'solid' && doc.units === 'in' && (
          <div className="wb-chip-row">
            {THICKNESS_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`wb-chip${Math.abs(part.dims.thickness - p.mm) < 0.01 ? ' on' : ''}`}
                onClick={() => store.getState().updatePartDims(part.id, { thickness: p.mm })}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {isRoundHole && (
          <div>
            <div className="wb-field-label">Drill sizes</div>
            <div className="wb-chip-row">
              {(doc.units === 'in' ? DRILL_SIZES_IN : DRILL_SIZES_MM.map(String)).map((label) => {
                const mm = doc.units === 'in' ? DRILL_FRACTION_MM[label] : Number(label)
                return (
                  <button
                    key={label}
                    className={`wb-chip${Math.abs(part.dims.diameter - mm) < 0.01 ? ' on' : ''}`}
                    onClick={() => store.getState().updatePartDims(part.id, { diameter: mm })}
                  >
                    {doc.units === 'in' ? `${label}"` : `${label} mm`}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="wb-group">
        <div className="wb-field-label">TURN</div>
        {isBoardish && (
          <div className="wb-btn-grid-3">
            {POSTURES.map((p) => (
              <button
                key={p.key}
                className="wb-btn small"
                style={{ flexDirection: 'column', gap: 2, minHeight: 62 }}
                onClick={() =>
                  withGroup((host, children) => applyPostureToGroup(host, children, p.rotation))
                }
              >
                <PostureIcon posture={p.key as 'flat' | 'edge' | 'standing'} />
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="wb-btn-grid">
          <button className="wb-btn small" onClick={() => turn('turn', 90)}>
            <SpinIcon dir="ccw" /> Turn
          </button>
          <button className="wb-btn small" onClick={() => turn('turn', -90)}>
            <SpinIcon dir="cw" /> Turn
          </button>
          <button className="wb-btn small" onClick={() => turn('tip', 90)}>
            <TipIcon dir="forward" /> Tip Forward
          </button>
          <button className="wb-btn small" onClick={() => turn('tip', -90)}>
            <TipIcon dir="back" /> Tip Back
          </button>
          <button className="wb-btn small" onClick={() => turn('tilt', -90)}>
            <TiltIcon dir="left" /> Tilt Left
          </button>
          <button className="wb-btn small" onClick={() => turn('tilt', 90)}>
            <TiltIcon dir="right" /> Tilt Right
          </button>
        </div>
        {Math.abs(part.rotation[0] % 360) < 0.01 && Math.abs(part.rotation[2] % 360) < 0.01 && (
          // Only meaningful while the piece is upright — for a tipped piece,
          // editing the Y angle directly is NOT a bench spin (the Turn
          // buttons still work; they compose about the world axis).
          <div>
            <div className="wb-field-label">Angle (spin on the bench)</div>
            <div className="wb-chip-row">
              {ANGLE_DETENTS.map((a) => (
                <button
                  key={a}
                  className={`wb-chip${Math.abs(((part.rotation[1] % 360) + 360) % 360 - a) < 0.01 ? ' on' : ''}`}
                  onClick={() => updateThis((p) => (p.rotation = [p.rotation[0], a, p.rotation[2]]))}
                >
                  {a}°
                </button>
              ))}
            </div>
          </div>
        )}
        <button className="wb-btn small" onClick={() => updateThis(applyFlip)}>
          <FlipIcon /> Flip (mirror)
        </button>
      </div>

      <div className="wb-group">
        <div className="wb-field-label">NUDGE (one snap step)</div>
        <div className="wb-btn-grid-3">
          <button className="wb-btn small" onClick={() => nudge(part, -1, 0, 0)}>
            <ArrowIcon dir="left" /> Left
          </button>
          <button className="wb-btn small" onClick={() => nudge(part, 0, 0, -1)}>
            <ArrowIcon dir="back" /> Back
          </button>
          <button className="wb-btn small" onClick={() => nudge(part, 1, 0, 0)}>
            <ArrowIcon dir="right" /> Right
          </button>
          <button className="wb-btn small" onClick={() => nudge(part, 0, 1, 0)}>
            <ArrowIcon dir="up" /> Up
          </button>
          <button className="wb-btn small" onClick={() => nudge(part, 0, 0, 1)}>
            <ArrowIcon dir="forward" /> Forward
          </button>
          <button className="wb-btn small" onClick={() => nudge(part, 0, -1, 0)}>
            <ArrowIcon dir="down" /> Down
          </button>
        </div>
        {airborne && bbox && (
          <>
            <div className="wb-hint">
              {formatLength(bbox.min[1], doc.units)} above the bench
            </div>
            <button
              className="wb-btn small wide"
              onClick={() => updateThis((p) => (p.position = [p.position[0], p.position[1] - bbox.min[1], p.position[2]]))}
            >
              Drop to Floor
            </button>
          </>
        )}
      </div>

      <div className="wb-group">
        <button className="wb-btn wide" onClick={() => store.getState().duplicateSelection()}>
          Copy This Piece
        </button>
        <button
          className="wb-btn wide"
          onClick={() => store.getState().toggleLock([part.id])}
        >
          <PinIcon /> {part.locked ? 'Let It Move' : 'Hold in Place'}
        </button>
        <button className="wb-btn danger wide" onClick={removeThis}>
          Remove This Piece
        </button>
      </div>
    </div>
  )
}

function nudge(part: Part, dx: number, dy: number, dz: number) {
  const s = useStore.getState()
  if (part.locked) {
    useBus.getState().flash('This piece is held in place')
    return
  }
  const step = s.doc.snapStep
  s.updateParts([part.id], (p) => {
    // a piece can never sink through the bench: its bbox bottom stays >= 0
    const floorY = worldSize(p)[1] / 2
    p.position = [
      p.position[0] + dx * step,
      Math.max(p.position[1] + dy * step, floorY),
      p.position[2] + dz * step,
    ]
  })
  // after the engine re-evaluates, settle where this piece now belongs
  window.setTimeout(() => autoAttach([part.id]), 150)
}

export function Inspector() {
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const parts = doc.parts.filter((p) => selection.includes(p.id))
  if (parts.length === 0) return <SummaryPanel />
  if (parts.length > 1) return <MultiPanel />
  return <SinglePanel part={parts[0]} />
}
