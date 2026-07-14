// First-run coach marks: three plain sentences, advanced by DOING, each
// skippable, retired forever once done (replayable from Help).

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../model/store'
import { formatLengthBare } from '../model/units'
import { useBus } from '../viewport/bus'
import { TEMPLATES } from '../model/templates'
import { beginNewProject, currentProjectId, saveProject } from './projectsStore'

const COACH_KEY = 'workbench-coach-done'
const OFFER_KEY = 'workbench-offer-done'

export function coachAlreadyDone(): boolean {
  return !!localStorage.getItem(COACH_KEY)
}

export function resetCoach(): void {
  localStorage.removeItem(COACH_KEY)
  localStorage.removeItem(OFFER_KEY)
}

interface Props {
  /** bumped by Help → "Show me the basics again" */
  replayNonce: number
}

export function Coach({ replayNonce }: Props) {
  const [step, setStep] = useState(() => (coachAlreadyDone() ? 4 : 1))
  const [offerVisible, setOfferVisible] = useState(false)
  const doc = useStore((s) => s.doc)
  const camera = useBus((s) => s.camera)

  // watch for "he did the thing" per step
  const baseline = useRef<{ dims?: string; pos?: string; yaw?: number }>({})

  useEffect(() => {
    if (replayNonce > 0) {
      resetCoach()
      setStep(1)
      baseline.current = {}
    }
  }, [replayNonce])

  useEffect(() => {
    if (step > 3) return
    const first = doc.parts.find((p) => p.role === 'solid')
    if (!first) return
    if (step === 1) {
      // fingerprint ALL dims — the first piece may be a dowel or ball with no 'length'
      const key = Object.entries(first.dims)
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
      if (baseline.current.dims === undefined) baseline.current.dims = key
      else if (key !== baseline.current.dims) setStep(2)
    }
    if (step === 2) {
      const key = first.position.join(',')
      if (baseline.current.pos === undefined) baseline.current.pos = key
      else if (key !== baseline.current.pos) setStep(3)
    }
  }, [doc, step])

  useEffect(() => {
    if (step !== 3 || !camera) return
    baseline.current.yaw = camera.yawDeg()
    const t = window.setInterval(() => {
      if (Math.abs((camera.yawDeg() ?? 0) - (baseline.current.yaw ?? 0)) > 8) {
        setStep(4)
      }
    }, 400)
    return () => window.clearInterval(t)
  }, [step, camera])

  useEffect(() => {
    if (step === 4) {
      localStorage.setItem(COACH_KEY, '1')
      if (!localStorage.getItem(OFFER_KEY)) setOfferVisible(true)
    }
  }, [step])

  const skip = () => setStep((s) => (s >= 3 ? 4 : s + 1))

  const openBookshelf = () => {
    localStorage.setItem(OFFER_KEY, '1')
    setOfferVisible(false)
    const t = TEMPLATES.find((t) => t.id === 'bookshelf')
    if (t) {
      // never lose the project he just made — same rule as every switch flow
      saveProject(currentProjectId(), useStore.getState().doc)
      beginNewProject()
      useStore.getState().loadDoc(t.build())
      useBus.getState().toast('Here is a finished bookshelf. Click any piece to see how it was made.')
    }
  }

  const firstSolid = doc.parts.find((p) => p.role === 'solid')
  const step1Text =
    firstSolid && firstSolid.kind === 'board'
      ? `This board is ${formatLengthBare(firstSolid.dims.length, doc.units)} ${
          doc.units === 'in' ? 'inches' : 'millimeters'
        } long. Type a new length in the panel on the right →`
      : 'Type a new size in the panel on the right →'

  const messages: Record<number, { text: string; cls: string; style: React.CSSProperties }> = {
    1: {
      text: step1Text,
      cls: 'point-right',
      style: { right: 24, top: 120 },
    },
    2: {
      text: 'Nice. Now drag the board to slide it around the bench.',
      cls: 'point-down',
      style: { left: '40%', bottom: 140 },
    },
    3: {
      text: 'Last one: drag the empty background to walk around your project.',
      cls: 'point-down',
      style: { left: '40%', bottom: 140 },
    },
  }

  if (step <= 3) {
    const m = messages[step]
    return (
      <div className={`wb-coach ${m.cls}`} style={m.style}>
        {m.text}
        <button className="x" onClick={skip} title="Skip">
          ×
        </button>
      </div>
    )
  }

  if (offerVisible) {
    return (
      <div className="wb-offer">
        <strong>First time here?</strong>
        <span>Want to see a finished bookshelf you can take apart and study?</span>
        <button className="wb-btn primary" onClick={openBookshelf}>
          Show me the bookshelf
        </button>
        <button
          className="wb-btn small"
          onClick={() => {
            localStorage.setItem(OFFER_KEY, '1')
            setOfferVisible(false)
          }}
        >
          No thanks
        </button>
      </div>
    )
  }

  return null
}
