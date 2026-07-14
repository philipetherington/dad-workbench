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
import { clampDims, DIM_SPECS, worldBottomOffset, worldSize } from './types'
import type { ToolbarItem } from './parts'
import { createPart, emptyDoc } from './parts'
import { DEFAULT_SNAP } from './units'

/** Glued parts always select together — expand ids to whole glue sets. */
function expandGlue(doc: Doc, ids: string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    const part = doc.parts.find((p) => p.id === id)
    if (!part) continue
    out.add(id)
    if (part.glueId) {
      for (const q of doc.parts) if (q.glueId === part.glueId) out.add(q.id)
    }
  }
  return [...out]
}

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
  unglue: (glueId: string | string[]) => void
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
      if (!additive) return { selection: expandGlue(s.doc, ids) }
      const merged = new Set(s.selection)
      for (const id of expandGlue(s.doc, ids)) {
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
      // Keep the part's BOTTOM at the same height when its size changes
      // (parts grow up, not down through the bench) — in world space, so a
      // lying dowel whose diameter grows also stays on the bench.
      const oldBottom = p.position[1] - worldBottomOffset(p)
      p.dims = clampDims(p.kind, { ...p.dims, ...dims })
      p.position[1] = oldBottom + worldBottomOffset(p)
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
      d.glues = d.glues.filter((g) => d.parts.some((p) => p.glueId === g.id))
    })
    set({ selection: [] })
  },

  duplicateSelection: () => {
    const s = get()
    if (s.selection.length === 0) return
    const offset = Math.max(s.doc.snapStep * 4, 20)
    const newIds: string[] = []
    get().mutate((d) => {
      // copies of glued parts get their own fresh glue, never the original's
      const glueMap = new Map<string, string>()
      const copies = d.parts
        .filter((p) => s.selection.includes(p.id))
        .map((p) => {
          const c: Part = JSON.parse(JSON.stringify(p))
          c.id = crypto.randomUUID()
          c.name = `${p.name} copy`
          c.position = [p.position[0] + offset, p.position[1], p.position[2] + offset]
          if (c.glueId) {
            if (!glueMap.has(c.glueId)) {
              const nid = crypto.randomUUID()
              const src = d.glues.find((g) => g.id === c.glueId)
              glueMap.set(c.glueId, nid)
              d.glues.push({ id: nid, name: src ? `${src.name} copy` : 'Glued piece' })
            }
            c.glueId = glueMap.get(c.glueId)!
          }
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
      const taken = new Set(d.glues.map((g) => g.name))
      let n = 1
      while (taken.has(`Glued piece ${n}`)) n += 1
      d.glues.push({ id: glueId, name: `Glued piece ${n}` })
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
    // one undo step even when taking several assemblies apart at once
    const glueIds = Array.isArray(glueId) ? glueId : [glueId]
    get().mutate((d) => {
      for (const p of d.parts) if (p.glueId && glueIds.includes(p.glueId)) delete p.glueId
      d.glues = d.glues.filter((g) => !glueIds.includes(g.id))
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

    // A glued assembly lines up as ONE unit — moving its members
    // independently would collapse the shape the user built.
    interface Unit {
      partIds: string[]
      min: [number, number]
      max: [number, number] // [x, z]
    }
    const unitMap = new Map<string, Unit>()
    for (const id of ids) {
      const part = s.doc.parts.find((p) => p.id === id)!
      const key = part.glueId ?? part.id
      const b = bboxes[id]
      const u = unitMap.get(key)
      if (!u) {
        unitMap.set(key, {
          partIds: [id],
          min: [b.min[0], b.min[2]],
          max: [b.max[0], b.max[2]],
        })
      } else {
        u.partIds.push(id)
        u.min = [Math.min(u.min[0], b.min[0]), Math.min(u.min[1], b.min[2])]
        u.max = [Math.max(u.max[0], b.max[0]), Math.max(u.max[1], b.max[2])]
      }
    }
    const units = [...unitMap.values()]
    if (mode === 'even' ? units.length < 3 : units.length < 2) return

    get().mutate((d) => {
      const moveUnit = (u: Unit, axis: 0 | 2, delta: number) => {
        for (const p of d.parts) {
          if (u.partIds.includes(p.id)) p.position[axis] += delta
        }
      }
      const ua = (axis: 0 | 2) => (axis === 0 ? 0 : 1) // unit min/max index
      if (mode === 'even') {
        const axis: 0 | 2 =
          Math.max(...units.map((u) => u.max[0])) - Math.min(...units.map((u) => u.min[0])) >=
          Math.max(...units.map((u) => u.max[1])) - Math.min(...units.map((u) => u.min[1]))
            ? 0
            : 2
        const i = ua(axis)
        const sorted = [...units].sort((a, b) => a.min[i] + a.max[i] - (b.min[i] + b.max[i]))
        const totalSize = sorted.reduce((acc, u) => acc + (u.max[i] - u.min[i]), 0)
        const lo = Math.min(...units.map((u) => u.min[i]))
        const hi = Math.max(...units.map((u) => u.max[i]))
        const gap = (hi - lo - totalSize) / (sorted.length - 1)
        let cursor = lo
        for (const u of sorted) {
          moveUnit(u, axis, cursor - u.min[i])
          cursor += u.max[i] - u.min[i] + gap
        }
        return
      }
      const axis: 0 | 2 = mode === 'left' || mode === 'right' || mode === 'centerAcross' ? 0 : 2
      const i = ua(axis)
      if (mode === 'left' || mode === 'back') {
        const target = Math.min(...units.map((u) => u.min[i]))
        for (const u of units) moveUnit(u, axis, target - u.min[i])
      } else if (mode === 'right' || mode === 'front') {
        const target = Math.max(...units.map((u) => u.max[i]))
        for (const u of units) moveUnit(u, axis, target - u.max[i])
      } else {
        const target = units.reduce((acc, u) => acc + (u.min[i] + u.max[i]) / 2, 0) / units.length
        for (const u of units) moveUnit(u, axis, target - (u.min[i] + u.max[i]) / 2)
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
      selection: expandGlue(prev, s.selection),
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
      selection: expandGlue(next, s.selection),
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
    // no history: one undo step per keystroke would bury real work
    get().mutate((d) => {
      d.name = name
    }, { history: false }),
}))

// --- persistence helpers (autosave wiring lives in main.tsx) ---

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc, null, 2)
}

const VALID_ROLES = new Set(['solid', 'hole'])

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n))
}

/**
 * Strict structural validation: user-supplied files and old autosaves must
 * never be able to install a doc that crashes the app on every launch.
 * Repairs what it safely can (dims via clampDims), rejects the rest.
 */
export function deserializeDoc(json: string): Doc | null {
  try {
    const d = JSON.parse(json)
    if (!d || d.version !== 1 || !Array.isArray(d.parts)) return null
    for (const p of d.parts) {
      if (
        typeof p !== 'object' || p === null ||
        typeof p.id !== 'string' ||
        typeof p.name !== 'string' ||
        !(p.kind in DIM_SPECS) ||
        !VALID_ROLES.has(p.role) ||
        !isVec3(p.position) ||
        !isVec3(p.rotation) ||
        typeof p.dims !== 'object' || p.dims === null
      ) {
        return null
      }
      p.dims = clampDims(p.kind, p.dims)
      if (typeof p.color !== 'string') p.color = '#c9a06a'
    }
    d.units = d.units === 'in' || d.units === 'mm' ? d.units : 'mm'
    d.snapStep = Number.isFinite(d.snapStep) && d.snapStep > 0 ? d.snapStep : DEFAULT_SNAP[d.units as 'in' | 'mm']
    d.name = typeof d.name === 'string' ? d.name : 'Untitled project'
    d.glues = Array.isArray(d.glues)
      ? d.glues.filter((g: unknown) => {
          const glue = g as { id?: unknown; name?: unknown }
          return glue && typeof glue.id === 'string' && typeof glue.name === 'string'
        })
      : []
    return d as Doc
  } catch {
    return null
  }
}
