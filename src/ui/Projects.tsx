// The "My Projects" sheet: start fresh, open a saved file, start from an
// example, or pick up a recent project. Nothing here asks for confirmation —
// the current project is always stowed first, so no work is lost.
// The actual switching logic lives in projectFlows.ts, shared with the menu bar.

import { TEMPLATES } from '../model/templates'
import { currentProjectId, listProjects } from './projectsStore'
import { isNative } from './native'
import {
  loadRecent,
  openProjectFlow,
  startFresh,
  switchToNewProject,
} from './projectFlows'

export function ProjectsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  const currentId = currentProjectId()
  const recents = listProjects().filter((e) => e.id !== currentId)

  const handleOpenFile = async () => {
    const opened = await openProjectFlow()
    if (opened) onClose()
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
              <span className="sub">A fresh bench with one board on it</span>
            </span>
          </button>
          <button className="wb-sheet-row" onClick={handleOpenFile}>
            <span>
              Open a project file…
              <span className="sub">
                {isNative
                  ? 'A project you saved or were sent'
                  : 'A .workbench.json file you saved or were sent'}
              </span>
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
                  loadRecent(entry)
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
