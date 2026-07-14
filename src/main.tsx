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

// ---- boot: restore last session, or set up the first-run bench ----
const saved = localStorage.getItem(AUTOSAVE_KEY)
const doc = saved ? deserializeDoc(saved) : null
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
}

// ---- autosave: continuous, with the visible "All changes saved" label ----
let saveTimer: number | undefined
useStore.subscribe((s, prev) => {
  if (s.doc === prev.doc) return
  useBus.getState().setSaveState('saving')
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeDoc(s.doc))
      useBus.getState().setSaveState('saved')
    } catch (e) {
      console.error('autosave failed', e)
    }
  }, 400)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
