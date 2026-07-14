// The "My Projects" sheet: start fresh, open a saved file, start from an
// example, or pick up a recent project. Nothing here asks for confirmation —
// the current project is always saved to the registry first, so no work is lost.

import { TEMPLATES } from '../model/templates'
import { createPart, SOLID_ITEMS } from '../model/parts'
import { worldSize, type Doc } from '../model/types'
import { deserializeDoc, useStore } from '../model/store'
import { useBus } from '../viewport/bus'
import { openTextFile } from './files'
import { beginNewProject, currentProjectId, listProjects, saveProject, setCurrentProjectId } from './projectsStore'

/** Save whatever is on the bench right now under the current project id. */
function saveCurrent(): void {
  saveProject(currentProjectId(), useStore.getState().doc)
}

/** Swap the bench over to a fresh project holding the given document. */
function switchToNewProject(doc: Doc): void {
  saveCurrent()
  beginNewProject()
  useStore.getState().loadDoc(doc)
}

function startFresh(): void {
  saveCurrent()
  beginNewProject()
  const store = useStore.getState()
  store.newDoc()
  // Seed one Board so a new project never opens onto an empty void.
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

export function ProjectsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useBus((s) => s.toast)
  if (!open) return null

  const currentId = currentProjectId()
  const recents = listProjects().filter((e) => e.id !== currentId)

  const handleOpenFile = async () => {
    const text = await openTextFile('.json,.workbench,.txt')
    if (text === null) return // picker cancelled
    const doc = deserializeDoc(text)
    if (!doc) {
      toast("That file didn't look like a Workbench project")
      return
    }
    switchToNewProject(doc)
    onClose()
  }

  return (
    <div className="wb-sheet-backdrop" onClick={onClose}>
      <div className="wb-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="wb-sheet-close" onClick={onClose}>
          ✕ Close
        </button>
        <h2>My Projects</h2>

        <div className="rows">
          <button
            className="wb-sheet-row"
            onClick={() => {
              startFresh()
              onClose()
            }}
          >
            <span>
              Start a New Project
              <span className="sub">A fresh, empty bench</span>
            </span>
          </button>
          <button className="wb-sheet-row" onClick={handleOpenFile}>
            <span>
              Open a project file…
              <span className="sub">A .workbench.json file you saved or were sent</span>
            </span>
          </button>
        </div>

        <div className="wb-section-title">Start from an example</div>
        <div className="rows">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="wb-sheet-row"
              onClick={() => {
                switchToNewProject(t.build())
                onClose()
              }}
            >
              <span>
                {t.name}
                <span className="sub">{t.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="wb-section-title">Recent projects</div>
        {recents.length === 0 ? (
          <div style={{ fontSize: 16, color: 'var(--ink-soft)' }}>
            Projects you work on will appear here.
          </div>
        ) : (
          <div className="wb-recent-grid">
            {recents.map((entry) => (
              <button
                key={entry.id}
                className="wb-recent-card"
                onClick={() => {
                  saveCurrent()
                  useStore.getState().loadDoc(entry.doc)
                  setCurrentProjectId(entry.id)
                  onClose()
                }}
              >
                <span className="title">{entry.name}</span>
                <span className="date">{new Date(entry.savedAt).toLocaleDateString()}</span>
                <span className="date">
                  {entry.doc.parts.length === 1 ? '1 piece' : `${entry.doc.parts.length} pieces`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
