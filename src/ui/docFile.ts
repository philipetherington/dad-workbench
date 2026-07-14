// Which file the open project lives in, and keeping that file up to date.
//
// The design rule "there is no Save button to forget" survives here: once a
// project has a file, every change writes to that file automatically. Save
// (Cmd+S) exists only to satisfy muscle memory — it forces the flush that
// was already going to happen.

import { create } from 'zustand'
import { serializeDoc, useStore } from '../model/store'
import { useBus } from '../viewport/bus'
import { native, baseName } from './native'

const FLUSH_MS = 700

interface DocFileState {
  /** null = this project has never been given a file. */
  filePath: string | null
  setFilePath: (path: string | null) => void
}

export const useDocFile = create<DocFileState>((set) => ({
  filePath: null,
  setFilePath: (filePath) => set({ filePath }),
}))

let flushTimer: number | undefined
/** Serialized doc last written to disk — so we never rewrite an identical file. */
let lastWritten: string | null = null
let writing = false

/**
 * Write the current project to its file. With no file yet, asks where it
 * should live (this is the ONLY time the app asks about files at all).
 * Returns the path written, or null if the user cancelled the prompt.
 */
export async function saveToFile(force = false): Promise<string | null> {
  if (!native) return null
  const doc = useStore.getState().doc
  const contents = serializeDoc(doc)
  const { filePath } = useDocFile.getState()

  if (!force && filePath !== null && contents === lastWritten) return filePath

  useBus.getState().setSaveState('saving')
  try {
    const written = await native.saveProject(filePath, contents, doc.name)
    if (!written) {
      // cancelled the location prompt: nothing on disk, but localStorage
      // autosave still holds the work, so the label must not claim failure
      useBus.getState().setSaveState('saved')
      return null
    }
    useDocFile.getState().setFilePath(written)
    lastWritten = contents
    useBus.getState().setSaveState('saved')
    return written
  } catch (e) {
    console.error('save failed', e)
    useBus.getState().setSaveState('error')
    return null
  }
}

/** Save As: always ask for a new location, then keep saving there. */
export async function saveAs(): Promise<string | null> {
  if (!native) return null
  const doc = useStore.getState().doc
  const contents = serializeDoc(doc)
  const written = await native.saveProject(null, contents, doc.name)
  if (written) {
    useDocFile.getState().setFilePath(written)
    lastWritten = contents
    useBus.getState().setSaveState('saved')
    useBus.getState().toast(`Saved as ${baseName(written)}`)
  }
  return written
}

/** Adopt a file that was opened (or handed to us by Finder). */
export function adoptFile(path: string, contents: string): void {
  useDocFile.getState().setFilePath(path)
  lastWritten = contents
}

/** A brand-new project has no file until the user gives it one. */
export function forgetFile(): void {
  useDocFile.getState().setFilePath(null)
  lastWritten = null
}

/**
 * Start writing every change back to the project's file, and keep the window
 * title, proxy icon, and edited dot in step. Returns an unsubscribe function.
 */
export function startNativeDocSync(): () => void {
  const api = native
  if (!api) return () => {}

  const syncTitle = () => {
    const doc = useStore.getState().doc
    const { filePath } = useDocFile.getState()
    const dirty = filePath !== null && serializeDoc(doc) !== lastWritten
    api.setDocState({
      title: doc.name || 'Untitled Project',
      filePath,
      edited: dirty,
    })
  }

  const unsubDoc = useStore.subscribe((s, prev) => {
    if (s.doc === prev.doc) return
    syncTitle()
    // only auto-write once the project actually has a file; an untitled
    // project must never pop a save dialog at the user unprompted
    if (useDocFile.getState().filePath === null) return
    window.clearTimeout(flushTimer)
    flushTimer = window.setTimeout(async () => {
      if (writing) return
      writing = true
      try {
        await saveToFile()
      } finally {
        writing = false
        syncTitle()
      }
    }, FLUSH_MS)
  })

  const unsubFile = useDocFile.subscribe(syncTitle)
  syncTitle()

  return () => {
    window.clearTimeout(flushTimer)
    unsubDoc()
    unsubFile()
  }
}
