// Application state: the document, selection, and undo/redo history.
//
// History model: every user-visible change is either
//   - a one-shot action (addPart, delete, typed dimension...) -> mutate() with
//     history on (the default), which snapshots the pre-change doc, or
//   - a continuous drag -> startDrag() snapshots once, any number of
//     mutate(fn, { history: false }) calls follow, endDrag() commits the single
//     snapshot (or drops it if nothing changed).

import { create } from 'zustand'
import type { Doc, Part } from './types'
import { clampDims, localSize, worldSize } from './types'
import type { ToolbarItem } from './parts'
import { autoName, createPart, emptyDoc } from './parts'
import { DEFAULT_SNAP } from './units'

export type LineUpMode = 'left' | 'right' | 'front' | 'back' | 'centerAcross' | 'centerDeep' | 'even'

export interface BBoxMap {
  [id: string]: { min: [number, number, number]; max: [number, number, number] }
}

const HISTORY_LIMIT = 100
export const AUTOSAVE_KEY = 'workbench-autosave-v1'

function clone(doc: Doc): Doc {
  return JSON.parse(JSON.stringify(doc))
}

export interface WBState {
  doc: Doc
  selection: string[]
  past: Doc[]
  future: Doc[]
  dragBase: Doc | null

  // --- selection ---
  select: (ids: string[], additive?: boolean) => void
  clearSelection: () => void

  // --- document mutation ---
  mutate: (fn: (doc: Doc) => void, opts?: { history?: boolean }) => void
  startDrag: () => void
  endDrag: () => void

  addPart: (item: ToolbarItem) => Part
  updatePartDims: (id: string, dims: Record<string, number>) => void
  updateParts: (ids: string[], fn: (p: Part) => void, opts?: { history?: boolean }) => void
  deleteSelection: () => void
  duplicateSelection: () => void
  glueSelection: () => void
  unglue: (glueId: string) => void
  toggleLock: (ids: string[]) => void
  lineUp: (mode: LineUpMode, bboxes: BBoxMap) => void

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  newDoc: (units?: Doc['units']) => void
  loadDoc: (doc: Doc) => void
  setUnits: (units: Doc['units']) => void
  setSnap: (mm: number) => void
  setDocName: (name: string) => void
}

export const useStore = create<WBState>((set, get) => ({
  doc: emptyDoc('in'),
  selection: [],
  past: [],
  future: [],
  dragBase: null,

  select: (ids, additive = false) =>
    set((s) => {
      // Glued parts select together: expand every id to its whole glue set.
      const expand = (list: string[]) => {
        const out = new Set(list)
        for (const id of list) {
          const part = s.doc.parts.find((p) => p.id === id)
          if (part?.glueId) {
            for (const q of s.doc.parts) if (q.glueId === part.glueId) out.add(q.id)
          }
        }
        return out
      }
      if (!additive) return { selection: [...expand(ids)] }
      const merged = new Set(s.selection)
      for (const id of expand(ids)) {
        if (merged.has(id)) merged.delete(id)
        else merged.add(id)
      }
      return { selection: [...merged] }
    }),

  clearSelection: () => set({ selection: [] }),

  mutate: (fn, opts = {}) => {
    const { history = true } = opts
    const s = get()
    const next = clone(s.doc)
    fn(next)
    if (history && s.dragBase === null) {
      set({
        doc: next,
        past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.doc],
        future: [],
      })
    } else {
      set({ doc: next })
    }
  },

  startDrag: () => {
    const s = get()
    if (s.dragBase === null) set({ dragBase: clone(s.doc) })
  },

  endDrag: () => {
    const s = get()
    if (s.dragBase === null) return
    const changed = JSON.stringify(s.dragBase) !== JSON.stringify(s.doc)
    set({
      dragBase: null,
      ...(changed
        ? { past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.dragBase], future: [] }
        : {}),
    })
  },

  addPart: (item) => {
    const s = get()
    const part = createPart(s.doc, item)
    const [sx, sy, sz] = worldSize(part)
    // Place on the bench, nudged rightward of existing parts so new
    // pieces never spawn hidden inside old ones.
    let x = 0
    const step = Math.max(sx, sz) + 20
    const overlaps = (px: number) =>
      s.doc.parts.some((p) => {
        const [ox, , oz] = worldSize(p)
        return (
          Math.abs(p.position[0] - px) < (ox + sx) / 2 &&
          Math.abs(p.position[2]) < (oz + sz) / 2 + 1
        )
      })
    while (overlaps(x)) x += step
    part.position = [x, sy / 2, 0]
    get().mutate((d) => {
      d.parts.push(part)
    })
    set({ selection: [part.id] })
    return part
  },

  updatePartDims: (id, dims) => {
    get().mutate((d) => {
      const p = d.parts.find((q) => q.id === id)
      if (!p) return
      const oldSize = localSize(p)
      p.dims = clampDims(p.kind, { ...p.dims, ...dims })
      // Keep the part sitting at the same height off the bench when its
      // vertical size changes (parts grow up, not down through the bench).
      const newSize = localSize(p)
      if (p.rotation.every((r) => r === 0)) {
        p.position[1] += (newSize[1] - oldSize[1]) / 2
      }
    })
  },

  updateParts: (ids, fn, opts) => {
    get().mutate((d) => {
      for (const p of d.parts) if (ids.includes(p.id)) fn(p)
    }, opts)
  },

  deleteSelection: () => {
    const s = get()
    if (s.selection.length === 0) return
    get().mutate((d) => {
      d.parts = d.parts.filter((p) => !s.selection.includes(p.id))
    })
    set({ selection: [] })
  },

  duplicateSelection: () => {
    const s = get()
    if (s.selection.length === 0) return
    const offset = Math.max(s.doc.snapStep * 4, 20)
    const newIds: string[] = []
    get().mutate((d) => {
      const copies = d.parts
        .filter((p) => s.selection.includes(p.id))
        .map((p) => {
          const c: Part = JSON.parse(JSON.stringify(p))
          c.id = crypto.randomUUID()
          c.name = `${p.name} copy`
          c.position = [p.position[0] + offset, p.position[1], p.position[2] + offset]
          newIds.push(c.id)
          return c
        })
      d.parts.push(...copies)
    })
    set({ selection: newIds })
  },

  glueSelection: () => {
    const s = get()
    const ids = s.selection.filter((id) =>
      s.doc.parts.some((p) => p.id === id && p.role === 'solid'),
    )
    if (ids.length < 2) return
    const glueId = crypto.randomUUID()
    get().mutate((d) => {
      const name = autoName(d, 'Glued piece')
      d.glues.push({ id: glueId, name })
      for (const p of d.parts) {
        if (!ids.includes(p.id)) continue
        // one level only: joining an existing glue absorbs it
        if (p.glueId) d.glues = d.glues.filter((g) => g.id !== p.glueId)
        p.glueId = glueId
      }
      d.glues = d.glues.filter(
        (g) => g.id === glueId || d.parts.some((p) => p.glueId === g.id),
      )
    })
  },

  unglue: (glueId) => {
    get().mutate((d) => {
      for (const p of d.parts) if (p.glueId === glueId) delete p.glueId
      d.glues = d.glues.filter((g) => g.id !== glueId)
    })
  },

  toggleLock: (ids) => {
    const s = get()
    const anyUnlocked = s.doc.parts.some((p) => ids.includes(p.id) && !p.locked)
    get().mutate((d) => {
      for (const p of d.parts) if (ids.includes(p.id)) p.locked = anyUnlocked
    })
  },

  lineUp: (mode, bboxes) => {
    const s = get()
    const ids = s.selection.filter((id) => bboxes[id] && !s.doc.parts.find((p) => p.id === id)?.locked)
    if (ids.length < 2) return
    get().mutate((d) => {
      const parts = d.parts.filter((p) => ids.includes(p.id))
      const move = (p: Part, axis: 0 | 2, delta: number) => {
        p.position[axis] += delta
      }
      if (mode === 'even') {
        // Even spacing along the axis the selection is most spread out on.
        const axis: 0 | 2 =
          Math.max(...ids.map((i) => bboxes[i].max[0])) - Math.min(...ids.map((i) => bboxes[i].min[0])) >=
          Math.max(...ids.map((i) => bboxes[i].max[2])) - Math.min(...ids.map((i) => bboxes[i].min[2]))
            ? 0
            : 2
        const sorted = [...parts].sort(
          (a, b) => (bboxes[a.id].min[axis] + bboxes[a.id].max[axis]) - (bboxes[b.id].min[axis] + bboxes[b.id].max[axis]),
        )
        if (sorted.length < 3) return
        const totalSize = sorted.reduce((acc, p) => acc + (bboxes[p.id].max[axis] - bboxes[p.id].min[axis]), 0)
        const span =
          Math.max(...ids.map((i) => bboxes[i].max[axis])) - Math.min(...ids.map((i) => bboxes[i].min[axis]))
        const gap = (span - totalSize) / (sorted.length - 1)
        let cursor = Math.min(...ids.map((i) => bboxes[i].min[axis]))
        for (const p of sorted) {
          const size = bboxes[p.id].max[axis] - bboxes[p.id].min[axis]
          move(p, axis, cursor - bboxes[p.id].min[axis])
          cursor += size + gap
        }
        return
      }
      const axis: 0 | 2 = mode === 'left' || mode === 'right' || mode === 'centerAcross' ? 0 : 2
      if (mode === 'left' || mode === 'back') {
        const target = Math.min(...ids.map((i) => bboxes[i].min[axis]))
        for (const p of parts) move(p, axis, target - bboxes[p.id].min[axis])
      } else if (mode === 'right' || mode === 'front') {
        const target = Math.max(...ids.map((i) => bboxes[i].max[axis]))
        for (const p of parts) move(p, axis, target - bboxes[p.id].max[axis])
      } else {
        const target =
          ids.reduce((acc, i) => acc + (bboxes[i].min[axis] + bboxes[i].max[axis]) / 2, 0) / ids.length
        for (const p of parts) move(p, axis, target - (bboxes[p.id].min[axis] + bboxes[p.id].max[axis]) / 2)
      }
    })
  },

  undo: () => {
    const s = get()
    if (s.past.length === 0) return
    const prev = s.past[s.past.length - 1]
    set({
      doc: prev,
      past: s.past.slice(0, -1),
      future: [s.doc, ...s.future],
      selection: s.selection.filter((id) => prev.parts.some((p) => p.id === id)),
    })
  },

  redo: () => {
    const s = get()
    if (s.future.length === 0) return
    const next = s.future[0]
    set({
      doc: next,
      past: [...s.past, s.doc],
      future: s.future.slice(1),
      selection: s.selection.filter((id) => next.parts.some((p) => p.id === id)),
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  newDoc: (units = get().doc.units) =>
    set({ doc: emptyDoc(units), selection: [], past: [], future: [], dragBase: null }),

  loadDoc: (doc) => set({ doc, selection: [], past: [], future: [], dragBase: null }),

  setUnits: (units) =>
    get().mutate((d) => {
      d.units = units
      d.snapStep = DEFAULT_SNAP[units]
    }),

  setSnap: (mm) =>
    get().mutate((d) => {
      d.snapStep = mm
    }, { history: false }),

  setDocName: (name) =>
    get().mutate((d) => {
      d.name = name
    }),
}))

// --- persistence helpers (autosave wiring lives in main.tsx) ---

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc, null, 2)
}

export function deserializeDoc(json: string): Doc | null {
  try {
    const d = JSON.parse(json)
    if (d && d.version === 1 && Array.isArray(d.parts)) {
      d.glues ??= []
      return d as Doc
    }
    return null
  } catch {
    return null
  }
}
