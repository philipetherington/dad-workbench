// The builder sheet: "Build a Drawer for Me" / "Build a Door for Me".
// Type the opening, read one plain line about what will be made, press one
// button — a correctly assembled, glued group lands on the bench, clear of
// existing work. All the geometry lives in model/builders.ts; this sheet
// only collects measurements and pushes the result into the document.

import { useState } from 'react'
import { buildDoor, buildDrawer } from '../model/builders'
import { useStore } from '../model/store'
import { worldSize } from '../model/types'
import type { Part } from '../model/types'
import { IN } from '../model/units'
import { useBus } from '../viewport/bus'
import { DimField } from './DimField'

/**
 * Slide a fresh assembly rightward until its footprint overlaps no existing
 * solid — the same spawn nudge store.addPart uses, applied to a whole group.
 */
function nudgeClear(parts: Part[], existing: Part[]): void {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of parts) {
    const s = worldSize(p)
    minX = Math.min(minX, p.position[0] - s[0] / 2)
    maxX = Math.max(maxX, p.position[0] + s[0] / 2)
    minZ = Math.min(minZ, p.position[2] - s[2] / 2)
    maxZ = Math.max(maxZ, p.position[2] + s[2] / 2)
  }
  const sx = maxX - minX
  const sz = maxZ - minZ
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const solids = existing.filter((p) => p.role === 'solid')
  const step = Math.max(sx, sz) + 20
  const overlaps = (dx: number) =>
    solids.some((p) => {
      const [ox, , oz] = worldSize(p)
      return (
        Math.abs(p.position[0] - (cx + dx)) < (ox + sx) / 2 &&
        Math.abs(p.position[2] - cz) < (oz + sz) / 2 + 1
      )
    })
  let dx = 0
  while (overlaps(dx)) dx += step
  if (dx !== 0) for (const p of parts) p.position[0] += dx
}

export function BuilderSheet() {
  const builder = useBus((s) => s.builder)
  const setBuilder = useBus((s) => s.setBuilder)
  const units = useStore((s) => s.doc.units)
  const step = useStore((s) => s.doc.snapStep)

  // Sensible starting sizes: an 18 x 6 x 18" drawer, a 15 x 30" door.
  const [drawer, setDrawer] = useState({ width: 18 * IN, height: 6 * IN, depth: 18 * IN })
  const [door, setDoor] = useState({ width: 15 * IN, height: 30 * IN, frame: 2.25 * IN, overlay: 12.7 })

  if (builder === null) return null
  const isDrawer = builder === 'drawer'

  const build = () =>
    isDrawer
      ? buildDrawer(
          {
            openingWidth: drawer.width,
            openingHeight: drawer.height,
            depth: drawer.depth,
            stock: 12.7,
            slideClearance: 6.35,
          },
          units,
        )
      : buildDoor(
          {
            openingWidth: door.width,
            openingHeight: door.height,
            stileWidth: door.frame,
            railWidth: door.frame,
            stock: 0.75 * IN,
            overlay: door.overlay,
          },
          units,
        )

  // One plain line about what the button will make.
  const preview = build().parts
  const boards = preview.filter((p) => p.role === 'solid').length
  const grooves = preview.filter((p) => p.kind === 'groove').length
  const metal = preview.filter((p) => p.role === 'hardware').length
  const summary = `${boards} boards, ${grooves} grooves, ${metal} ${isDrawer ? 'slides' : 'hinges'}`

  const close = () => setBuilder(null)

  const putOnBench = () => {
    const { parts, glue } = build()
    const store = useStore.getState()
    nudgeClear(parts, store.doc.parts)
    store.mutate((d) => {
      d.glues.push(glue)
      d.parts.push(...parts)
    })
    store.select(parts.map((p) => p.id))
    close()
    useBus
      .getState()
      .toast(
        isDrawer
          ? 'Built a drawer — drag it where you want it'
          : 'Built a door — drag it where you want it',
        'Take Apart',
        () => useStore.getState().undo(),
      )
  }

  return (
    <div className="wb-sheet-backdrop" onClick={close}>
      <div className="wb-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="wb-sheet-close" onClick={close}>
          ✕ Close
        </button>
        <h2>{isDrawer ? 'Build a Drawer for Me' : 'Build a Door for Me'}</h2>

        {isDrawer ? (
          <div className="rows">
            <DimField
              label="Opening width"
              mm={drawer.width}
              units={units}
              step={step}
              min={4 * IN}
              onCommit={(mm) => setDrawer((s) => ({ ...s, width: mm }))}
            />
            <DimField
              label="Opening height"
              mm={drawer.height}
              units={units}
              step={step}
              min={2.5 * IN}
              onCommit={(mm) => setDrawer((s) => ({ ...s, height: mm }))}
            />
            <DimField
              label="How deep"
              mm={drawer.depth}
              units={units}
              step={step}
              min={10 * IN}
              onCommit={(mm) => setDrawer((s) => ({ ...s, depth: mm }))}
            />
          </div>
        ) : (
          <div className="rows">
            <DimField
              label="Opening width"
              mm={door.width}
              units={units}
              step={step}
              min={6 * IN}
              onCommit={(mm) => setDoor((s) => ({ ...s, width: mm }))}
            />
            <DimField
              label="Opening height"
              mm={door.height}
              units={units}
              step={step}
              min={6 * IN}
              onCommit={(mm) => setDoor((s) => ({ ...s, height: mm }))}
            />
            <DimField
              label="Frame width"
              mm={door.frame}
              units={units}
              step={step}
              min={1 * IN}
              onCommit={(mm) => setDoor((s) => ({ ...s, frame: mm }))}
            />
            <div>
              <div className="wb-field-label">How it meets the opening</div>
              <div className="wb-chip-row">
                <button
                  className={`wb-chip${door.overlay > 0 ? ' on' : ''}`}
                  onClick={() => setDoor((s) => ({ ...s, overlay: 12.7 }))}
                >
                  Sits over the opening 1/2&quot;
                </button>
                <button
                  className={`wb-chip${door.overlay === 0 ? ' on' : ''}`}
                  onClick={() => setDoor((s) => ({ ...s, overlay: 0 }))}
                >
                  Fits inside
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="wb-note">This will make {summary}.</div>

        <button className="wb-btn primary wide" onClick={putOnBench}>
          Put It on the Bench
        </button>
      </div>
    </div>
  )
}
