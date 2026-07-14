// Every way a project can be swapped out, in one place — so the My Projects
// sheet and the Mac menu bar can never drift apart, and so the current
// project is always stowed before it is replaced.

import { TEMPLATES } from '../model/templates'
import { createPart, SOLID_ITEMS } from '../model/parts'
import { worldSize, type Doc } from '../model/types'
import { deserializeDoc, useStore } from '../model/store'
import { useBus } from '../viewport/bus'
import { openTextFile } from './files'
import { native } from './native'
import { adoptFile, forgetFile } from './docFile'
import { beginNewProject, currentProjectId, saveProject, setCurrentProjectId } from './projectsStore'

/** Stow whatever is on the bench right now under the current project id. */
export function saveCurrent(): void {
  saveProject(currentProjectId(), useStore.getState().doc)
}

/** Swap the bench over to a fresh project holding the given document. */
export function switchToNewProject(doc: Doc, file?: { path: string; contents: string }): void {
  saveCurrent()
  beginNewProject()
  useStore.getState().loadDoc(doc)
  if (file) adoptFile(file.path, file.contents)
  else forgetFile()
}

/** A new project opens with one real board already on the bench. */
export function startFresh(): void {
  saveCurrent()
  beginNewProject()
  forgetFile()
  const store = useStore.getState()
  store.newDoc()
  const fresh = useStore.getState()
  const board = createPart(fresh.doc, SOLID_ITEMS[0])
  board.position = [0, worldSize(board)[1] / 2, 0]
  fresh.mutate(
    (d) => {
      d.parts.push(board)
    },
    { history: false },
  )
  useStore.getState().select([board.id])
}

/** Open a project file. Returns true if a project was actually loaded. */
export async function openProjectFlow(): Promise<boolean> {
  const toast = useBus.getState().toast
  if (native) {
    const file = await native.openProject()
    if (!file) return false // cancelled
    const doc = deserializeDoc(file.contents)
    if (!doc) {
      toast("That file didn't look like a Workbench project")
      return false
    }
    switchToNewProject(doc, file)
    return true
  }
  const text = await openTextFile('.json,.workbench,.txt')
  if (text === null) return false
  const doc = deserializeDoc(text)
  if (!doc) {
    toast("That file didn't look like a Workbench project")
    return false
  }
  switchToNewProject(doc)
  return true
}

/**
 * A file the OS handed us (double-click in Finder, drop on the Dock or window).
 * A null path means we only have the bytes, not a place on disk to write back
 * to — so the project loads but stays untitled.
 */
export function openHandedFile(path: string | null, contents: string): void {
  const doc = deserializeDoc(contents)
  if (!doc) {
    useBus.getState().toast("That file didn't look like a Workbench project")
    return
  }
  switchToNewProject(doc, path ? { path, contents } : undefined)
}

export function loadTemplate(id: string): void {
  const t = TEMPLATES.find((x) => x.id === id)
  if (t) switchToNewProject(t.build())
}

export function loadRecent(entry: { id: string; doc: Doc }): void {
  saveCurrent()
  useStore.getState().loadDoc(entry.doc)
  setCurrentProjectId(entry.id)
  forgetFile()
}
