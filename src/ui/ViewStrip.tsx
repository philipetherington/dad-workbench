// The permanent view strip: named views, spin, zoom, and the widest button
// in the app — "Show Everything". Plus the snap readout, bottom-left.

import { useState } from 'react'
import { useBus, type ViewName } from '../viewport/bus'
import { useStore } from '../model/store'
import { SNAP_OPTIONS } from '../model/units'
import { SpinIcon } from './Icons'

const VIEWS: { key: ViewName; label: string }[] = [
  { key: 'corner', label: 'Corner View' },
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left Side' },
  { key: 'right', label: 'Right Side' },
  { key: 'top', label: 'Top' },
]

export function ViewStrip() {
  const camera = useBus((s) => s.camera)
  const [active, setActive] = useState<ViewName>('corner')

  if (!camera) return null
  return (
    <div className="wb-viewstrip">
      <div className="row">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={`wb-view-btn${active === v.key ? ' on' : ''}`}
            onClick={() => {
              setActive(v.key)
              camera.goTo(v.key)
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button className="wb-view-btn" onClick={() => camera.spin(15)} title="Spin left">
          <SpinIcon dir="ccw" />
        </button>
        <button className="wb-view-btn" onClick={() => camera.spin(-15)} title="Spin right">
          <SpinIcon dir="cw" />
        </button>
        <button className="wb-view-btn" onClick={() => camera.zoom(0.8)}>
          Zoom In
        </button>
        <button className="wb-view-btn" onClick={() => camera.zoom(1.25)}>
          Zoom Out
        </button>
        <button
          className="wb-view-btn"
          style={{ minWidth: 200, fontWeight: 700 }}
          onClick={() => {
            setActive('corner')
            camera.showEverything()
          }}
        >
          Show Everything
        </button>
      </div>
    </div>
  )
}

export function SnapReadout() {
  const doc = useStore((s) => s.doc)
  const setSnap = useStore((s) => s.setSnap)
  const [open, setOpen] = useState(false)
  const options = SNAP_OPTIONS[doc.units]
  const current = options.find((o) => Math.abs(o.mm - doc.snapStep) < 0.001)

  return (
    <div className="wb-snap-readout" onClick={() => setOpen(!open)}>
      {open ? (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Snap to:
          {options.map((o) => (
            <button
              key={o.label}
              className={`wb-chip${Math.abs(o.mm - doc.snapStep) < 0.001 ? ' on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setSnap(o.mm)
                setOpen(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </span>
      ) : (
        <span>
          Snapping to nearest {current?.label ?? `${doc.snapStep} mm`}
        </span>
      )}
    </div>
  )
}
