// The Help sheet: replay the intro pointers, open the example bookshelf,
// or email the person who set the app up. Plus a plain-language basics list.

import { TEMPLATES } from '../model/templates'
import { useStore } from '../model/store'
import { beginNewProject, currentProjectId, saveProject } from './projectsStore'

// Who "Email your son" writes to. Change this address to point somewhere else.
const HELP_CONTACT = 'etherington.philip@gmail.com'

function openBookshelf(): void {
  const template = TEMPLATES.find((t) => t.id === 'bookshelf') ?? TEMPLATES[0]
  // Save the current bench first, then open the example under a fresh id.
  saveProject(currentProjectId(), useStore.getState().doc)
  beginNewProject()
  useStore.getState().loadDoc(template.build())
}

export function HelpSheet({
  open,
  onClose,
  onReplayBasics,
}: {
  open: boolean
  onClose: () => void
  onReplayBasics: () => void
}) {
  if (!open) return null

  return (
    <div className="wb-sheet-backdrop" onClick={onClose}>
      <div className="wb-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="wb-sheet-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>Help</h2>

        <div className="rows">
          <button
            className="wb-sheet-row"
            onClick={() => {
              onReplayBasics()
              onClose()
            }}
          >
            <span>
              Show me the basics again
              <span className="sub">Three quick pointers, right on your bench</span>
            </span>
          </button>
          <button
            className="wb-sheet-row"
            onClick={() => {
              openBookshelf()
              onClose()
            }}
          >
            <span>
              Open the example bookshelf
              <span className="sub">A finished project you can study and change</span>
            </span>
          </button>
          <button
            className="wb-sheet-row"
            onClick={() => {
              window.location.href = `mailto:${HELP_CONTACT}?subject=${encodeURIComponent('Workbench question')}`
            }}
          >
            <span>
              Email your son
              <span className="sub">He set this up for you</span>
            </span>
          </button>
        </div>

        <div className="wb-section-title">The basics</div>
        <ul style={{ margin: 0, paddingLeft: 26, fontSize: 17, lineHeight: 1.7 }}>
          <li>Click a piece to choose it</li>
          <li>Drag a piece to slide it</li>
          <li>Drag the empty background to walk around</li>
          <li>The orange handles change one size each</li>
          <li>Red striped pieces cut wood away</li>
          <li>Everything can be undone</li>
        </ul>
      </div>
    </div>
  )
}
