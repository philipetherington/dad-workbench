// Shared channel between the 3D viewport and the UI chrome:
// latest evaluation results, the camera API (view-strip buttons live in the
// chrome), and short-lived "Flush!" style flashes.

import { create } from 'zustand'
import type { EvalResult } from '../engine/evaluate'

export type ViewName = 'corner' | 'front' | 'back' | 'left' | 'right' | 'top'

export interface CameraApi {
  goTo: (view: ViewName) => void
  spin: (degrees: number) => void
  zoom: (factor: number) => void
  showEverything: () => void
  focusOn: (partId: string) => void
  /** Current turntable yaw in degrees (for view-relative Turn/Tip/Tilt). */
  yawDeg: () => number
}

export interface Flash {
  id: number
  text: string
}

export interface Toast {
  id: number
  text: string
  actionLabel?: string
  onAction?: () => void
}

interface BusState {
  result: EvalResult | null
  setResult: (r: EvalResult) => void
  camera: CameraApi | null
  setCamera: (c: CameraApi | null) => void
  showCutouts: boolean
  setShowCutouts: (v: boolean) => void
  kernelState: 'loading' | 'ready' | 'failed'
  setKernelState: (s: 'loading' | 'ready' | 'failed') => void
  flashes: Flash[]
  flash: (text: string) => void
  toasts: Toast[]
  toast: (text: string, actionLabel?: string, onAction?: () => void) => void
  dismissToast: (id: number) => void
  saveState: 'saved' | 'saving' | 'error'
  setSaveState: (s: 'saved' | 'saving' | 'error') => void
  /** Which named view is active, or null after a free orbit. */
  activeView: ViewName | null
  setActiveView: (v: ViewName | null) => void
  /** Live readout while dragging ("24 1/2\""), null when idle. */
  dragReadout: string | null
  setDragReadout: (t: string | null) => void
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
}

let flashSeq = 1

export const useBus = create<BusState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  camera: null,
  setCamera: (camera) => set({ camera }),
  showCutouts: true,
  setShowCutouts: (showCutouts) => set({ showCutouts }),
  kernelState: 'loading',
  setKernelState: (kernelState) => set({ kernelState }),
  flashes: [],
  flash: (text) => {
    const id = flashSeq++
    set((s) => ({ flashes: [...s.flashes, { id, text }] }))
    setTimeout(() => set((s) => ({ flashes: s.flashes.filter((f) => f.id !== id) })), 1200)
  },
  toasts: [],
  toast: (text, actionLabel, onAction) => {
    const id = flashSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, actionLabel, onAction }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 10000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  saveState: 'saved',
  setSaveState: (saveState) => set({ saveState }),
  activeView: 'corner',
  setActiveView: (activeView) => set({ activeView }),
  dragReadout: null,
  setDragReadout: (dragReadout) => set({ dragReadout }),
  hoveredId: null,
  setHoveredId: (hoveredId) => set({ hoveredId }),
}))
