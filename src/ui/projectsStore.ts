// The My Projects registry: a small localStorage-backed list of saved
// projects so nothing is ever lost when starting fresh or opening an example.
// All parsing is defensive — corrupt storage must never throw.

import type { Doc } from '../model/types'

const REGISTRY_KEY = 'workbench-projects-v1'
const CURRENT_KEY = 'workbench-current-project'
const MAX_PROJECTS = 30

export interface ProjectEntry {
  id: string
  name: string
  savedAt: string
  doc: Doc
}

function isEntry(e: unknown): e is ProjectEntry {
  if (typeof e !== 'object' || e === null) return false
  const c = e as Partial<ProjectEntry>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.savedAt === 'string' &&
    typeof c.doc === 'object' &&
    c.doc !== null &&
    Array.isArray((c.doc as Doc).parts)
  )
}

function readRegistry(): ProjectEntry[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry)
  } catch {
    return []
  }
}

function writeRegistry(entries: ProjectEntry[]): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or unavailable: saving quietly fails rather than crashing.
  }
}

/** All saved projects, newest first. */
export function listProjects(): ProjectEntry[] {
  return readRegistry().sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/** Save (or update) a project. The registry is capped at MAX_PROJECTS; the oldest are dropped. */
export function saveProject(id: string, doc: Doc): void {
  const entry: ProjectEntry = {
    id,
    name: typeof doc.name === 'string' && doc.name.trim() !== '' ? doc.name : 'Untitled project',
    savedAt: new Date().toISOString(),
    doc,
  }
  const rest = readRegistry().filter((e) => e.id !== id)
  const all = [entry, ...rest].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  writeRegistry(all.slice(0, MAX_PROJECTS))
}

export function getProject(id: string): ProjectEntry | null {
  return readRegistry().find((e) => e.id === id) ?? null
}

/** The id of the project currently on the bench, minting one if missing. */
export function currentProjectId(): string {
  try {
    const existing = localStorage.getItem(CURRENT_KEY)
    if (existing) return existing
  } catch {
    // fall through to mint a fresh id
  }
  const id = crypto.randomUUID()
  setCurrentProjectId(id)
  return id
}

/** Mint a fresh project id, store it as current, and return it. */
export function beginNewProject(): string {
  const id = crypto.randomUUID()
  setCurrentProjectId(id)
  return id
}

export function setCurrentProjectId(id: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // Storage unavailable: the session simply won't remember which project is open.
  }
}
