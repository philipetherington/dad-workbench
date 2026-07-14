// Top bar: project name · My Projects · Undo/Redo + saved label · units · Make It · Help.

import { useStore } from '../model/store'
import { useBus } from '../viewport/bus'
import { UndoIcon, RedoIcon } from './Icons'

interface Props {
  onOpenProjects: () => void
  onOpenMakeIt: () => void
  onOpenHelp: () => void
}

export function TopBar({ onOpenProjects, onOpenMakeIt, onOpenHelp }: Props) {
  const doc = useStore((s) => s.doc)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const setDocName = useStore((s) => s.setDocName)
  const setUnits = useStore((s) => s.setUnits)
  const saveState = useBus((s) => s.saveState)

  const toggleUnits = () => {
    const next = doc.units === 'in' ? 'mm' : 'in'
    if (!localStorage.getItem('workbench-units-explained')) {
      localStorage.setItem('workbench-units-explained', '1')
      useBus
        .getState()
        .toast(
          `Showing this project in ${next === 'mm' ? 'millimeters' : 'inches'} instead. Your parts stay exactly the same size — only the labels change.`,
        )
    }
    setUnits(next)
  }

  return (
    <div className="wb-topbar">
      <input
        className="wb-project-name"
        value={doc.name}
        placeholder="Name this project"
        onChange={(e) => setDocName(e.target.value)}
        spellCheck={false}
      />
      <button className="wb-btn small" onClick={onOpenProjects}>
        My Projects
      </button>
      <div className="spacer" />
      <button className="wb-btn" onClick={undo} disabled={!canUndo}>
        <UndoIcon /> Undo
      </button>
      <button className="wb-btn" onClick={redo} disabled={!canRedo}>
        <RedoIcon /> Redo
      </button>
      <span
        className={`wb-saved${saveState === 'saving' ? ' saving' : ''}`}
        style={saveState === 'error' ? { color: 'var(--red)', fontWeight: 700 } : undefined}
      >
        {saveState === 'saving'
          ? 'Saving…'
          : saveState === 'error'
            ? 'Not saved — storage is full'
            : 'All changes saved ✓'}
      </span>
      <div className="spacer" />
      <button className="wb-btn small" onClick={toggleUnits}>
        {doc.units === 'in' ? 'Show in millimeters' : 'Show in inches'}
      </button>
      <button className="wb-btn primary" onClick={onOpenMakeIt}>
        Make It…
      </button>
      <button className="wb-btn small" onClick={onOpenHelp}>
        Help
      </button>
    </div>
  )
}
