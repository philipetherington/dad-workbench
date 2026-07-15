// The four fixed regions. Nothing collapses, docks, tabs, or hides.

import { useEffect, useState } from 'react'
import { Viewport } from '../viewport/Viewport'
import { useBus, type ViewName } from '../viewport/bus'
import { useStore } from '../model/store'
import { serializeDoc } from '../model/store'
import { cutListHTML } from '../exporters/cutlist'
import { TopBar } from './TopBar'
import { LeftPanel } from './LeftPanel'
import { Inspector } from './Inspector'
import { ViewStrip, SnapReadout } from './ViewStrip'
import { MakeItSheet } from './MakeIt'
import { BuilderSheet } from './BuilderSheet'
import { ProjectsSheet } from './Projects'
import { HelpSheet } from './Help'
import { Coach } from './Coach'
import { currentProjectId, saveProject } from './projectsStore'
import { native } from './native'
import { printHTML } from './files'
import { saveAs, saveToFile, startNativeDocSync } from './docFile'
import {
  loadTemplate,
  openHandedFile,
  openProjectFlow,
  startFresh,
} from './projectFlows'

function Overlays() {
  const flashes = useBus((s) => s.flashes)
  const toasts = useBus((s) => s.toasts)
  const dismissToast = useBus((s) => s.dismissToast)
  const dragReadout = useBus((s) => s.dragReadout)

  return (
    <>
      {flashes.map((f) => (
        <div key={f.id} className="wb-flash">
          {f.text}
        </div>
      ))}
      {dragReadout && <div className="wb-drag-readout">{dragReadout}</div>}
      <div className="wb-toasts">
        {toasts.map((t) => (
          <div key={t.id} className="wb-toast">
            <span>{t.text}</span>
            {t.actionLabel && (
              <button
                onClick={() => {
                  t.onAction?.()
                  dismissToast(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/** The dovetail mark, matching the app icon. */
function DovetailMark({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <rect x="8" y="20" width="80" height="56" rx="6" fill="#c9a06a" stroke="#2b2318" strokeWidth="4" />
      <path d="M48 20 h40 v56 h-40 l10-10 -10-8 10-10 -10-8 10-10 z" fill="#8d5a34" stroke="#2b2318" strokeWidth="4" strokeLinejoin="round" />
      <path d="M48 44 l10 6 -10 8 z" fill="#ff7a1a" stroke="#2b2318" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}

export function App() {
  const kernelState = useBus((s) => s.kernelState)
  const [sheet, setSheet] = useState<'none' | 'makeit' | 'projects' | 'help'>('none')
  const [replayNonce, setReplayNonce] = useState(0)
  // the splash stays up until the kernel is ready AND it has had a moment to
  // be read — a 60ms flash of branding is worse than none
  const [splashMinTime, setSplashMinTime] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSplashMinTime(true), 1400)
    return () => window.clearTimeout(t)
  }, [])
  const splashDone = kernelState === 'ready' && splashMinTime

  // quiet keyboard support (never taught, never required)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const s = useStore.getState()
      const sheetOpen = sheet !== 'none'
      if (e.key === 'Escape') {
        if (sheetOpen) setSheet('none')
        else s.clearSelection()
        return
      }
      // while a sheet is up, keys must not invisibly edit the project behind it
      if (sheetOpen) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (e.key.toLowerCase() === 'z' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // quiet power feature: whole-scene wireframe view
        useBus.getState().setWireframe(!useBus.getState().wireframe)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (s.selection.length > 0) {
          e.preventDefault()
          const n = s.selection.length
          const name =
            n === 1 ? s.doc.parts.find((p) => p.id === s.selection[0])?.name ?? 'piece' : `${n} pieces`
          s.deleteSelection()
          useBus.getState().toast(`Removed ${n === 1 ? `'${name}'` : name}`, 'Put It Back', () => s.undo())
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  // keep the project registry in sync with autosave (for the Recents grid)
  useEffect(() => {
    let t: number | undefined
    const unsub = useStore.subscribe((s, prev) => {
      if (s.doc === prev.doc) return
      window.clearTimeout(t)
      t = window.setTimeout(() => saveProject(currentProjectId(), s.doc), 1500)
    })
    return () => {
      window.clearTimeout(t)
      unsub()
    }
  }, [])

  // warn (in console only) if autosave serialization ever fails
  useEffect(() => {
    try {
      serializeDoc(useStore.getState().doc)
    } catch (e) {
      console.error(e)
    }
  }, [])

  // ---- native app: menu bar, files handed over by Finder, title sync ----

  useEffect(() => {
    if (!native) return
    return startNativeDocSync()
  }, [])

  useEffect(() => {
    if (!native) return
    const offOpen = native.onOpenFile(({ path, contents }) => openHandedFile(path, contents))
    const offMenu = native.onMenu((command) => {
      const s = useStore.getState()
      const camera = useBus.getState().camera

      if (command.startsWith('view:')) {
        const what = command.slice(5)
        if (what === 'showEverything') {
          useBus.getState().setActiveView('corner')
          camera?.showEverything()
        } else if (what === 'zoomIn') camera?.zoom(0.8)
        else if (what === 'zoomOut') camera?.zoom(1.25)
        else {
          useBus.getState().setActiveView(what as ViewName)
          camera?.goTo(what as ViewName)
        }
        return
      }

      switch (command) {
        case 'new':
          startFresh()
          break
        case 'open':
          void openProjectFlow()
          break
        case 'save':
          void saveToFile(true)
          break
        case 'saveAs':
          void saveAs()
          break
        case 'makeIt':
          setSheet('makeit')
          break
        case 'printCutList':
          printHTML(cutListHTML(s.doc))
          break
        case 'undo':
          s.undo()
          break
        case 'redo':
          s.redo()
          break
        case 'duplicate':
          s.duplicateSelection()
          break
        case 'delete': {
          if (s.selection.length === 0) break
          const n = s.selection.length
          const name =
            n === 1 ? (s.doc.parts.find((p) => p.id === s.selection[0])?.name ?? 'piece') : `${n} pieces`
          s.deleteSelection()
          useBus.getState().toast(`Removed ${n === 1 ? `'${name}'` : name}`, 'Put It Back', () => s.undo())
          break
        }
        case 'help:basics':
          setReplayNonce((v) => v + 1)
          break
        case 'help:bookshelf':
          loadTemplate('bookshelf')
          break
        case 'help:open':
          setSheet('help')
          break
      }
    })
    return () => {
      offOpen()
      offMenu()
    }
  }, [])

  // drop a .workbench file anywhere on the window
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      e.preventDefault()
      const path = native?.pathForFile(file) ?? null
      file.text().then(
        (contents) => openHandedFile(path, contents),
        () => useBus.getState().toast("That file couldn't be read"),
      )
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="wb-app">
      <TopBar
        onOpenProjects={() => setSheet('projects')}
        onOpenMakeIt={() => setSheet('makeit')}
        onOpenHelp={() => setSheet('help')}
      />
      <LeftPanel />
      <div className="wb-center">
        <div className="wb-canvas-wrap">
          <Viewport />
          <Overlays />
          <Coach replayNonce={replayNonce} />
        </div>
        {/* the camera controls live in their own band — never over the model */}
        <div className="wb-bench-band">
          <SnapReadout />
          <ViewStrip />
        </div>
      </div>
      <Inspector />

      <MakeItSheet open={sheet === 'makeit'} onClose={() => setSheet('none')} />
      <BuilderSheet />
      <ProjectsSheet open={sheet === 'projects'} onClose={() => setSheet('none')} />
      <HelpSheet
        open={sheet === 'help'}
        onClose={() => setSheet('none')}
        onReplayBasics={() => setReplayNonce((n) => n + 1)}
      />

      {!splashDone && kernelState !== 'failed' && (
        <div className="wb-splash">
          <DovetailMark />
          <div className="logo">
            <span className="dad">DAD</span> Workbench
          </div>
          <div className="tagline">Digitally Assisted Design</div>
          <div className="status">Getting the bench ready…</div>
        </div>
      )}
      {kernelState === 'failed' && (
        <div className="wb-splash">
          <DovetailMark />
          <div className="logo">
            <span className="dad">DAD</span> Workbench
          </div>
          <div className="status">
            Something went wrong loading the workshop. Try closing and opening it again.
          </div>
        </div>
      )}
    </div>
  )
}
