import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './ui/App'
import { initKernel } from './engine/kernel'
import { AUTOSAVE_KEY, deserializeDoc, serializeDoc, useStore } from './model/store'
import { createPart, SOLID_ITEMS } from './model/parts'
import { worldSize } from './model/types'
import { useBus } from './viewport/bus'

// ---- boot: kernel ----
initKernel()
  .then(() => useBus.getState().setKernelState('ready'))
  .catch((e) => {
    console.error('Manifold kernel failed to load', e)
    useBus.getState().setKernelState('failed')
  })

// ---- autosave: continuous, with the visible "All changes saved" label ----
// Registered BEFORE the first-run seed, so the bench he is handed on day one
// is itself persisted — otherwise closing the app without touching anything
// would leave nothing on disk.
function writeAutosave(): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeDoc(useStore.getState().doc))
    useBus.getState().setSaveState('saved')
  } catch (e) {
    console.error('autosave failed', e)
    useBus.getState().setSaveState('error')
  }
}

let saveTimer: number | undefined
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc) return
  useBus.getState().setSaveState('saving')
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(writeAutosave, 400)
})

// ---- boot: restore last session, or set up the first-run bench ----
let doc = null
try {
  const saved = localStorage.getItem(AUTOSAVE_KEY)
  doc = saved ? deserializeDoc(saved) : null
  // a corrupt autosave must never brick every future launch
  if (saved && !doc) localStorage.removeItem(AUTOSAVE_KEY)
} catch (e) {
  console.error('autosave restore failed', e)
}
if (doc) {
  useStore.getState().loadDoc(doc)
} else {
  // First run: one real board already on the bench, selected. His first act
  // is typing a number into a focused field — success in the first ten seconds.
  const store = useStore.getState()
  const board = createPart(store.doc, SOLID_ITEMS[0])
  board.position = [0, worldSize(board)[1] / 2, 0]
  store.loadDoc({ ...store.doc, parts: [board] })
  store.select([board.id])
  writeAutosave()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
