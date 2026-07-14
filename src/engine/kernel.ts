// Manifold WASM kernel lifecycle. Call initKernel() once at app boot;
// everything else in engine/ assumes it has resolved.

import Module from 'manifold-3d'
import type { ManifoldToplevel } from 'manifold-3d'

let toplevel: ManifoldToplevel | null = null
let pending: Promise<ManifoldToplevel> | null = null

export function initKernel(): Promise<ManifoldToplevel> {
  if (toplevel) return Promise.resolve(toplevel)
  if (!pending) {
    pending = Module().then((m) => {
      m.setup()
      toplevel = m
      return m
    })
  }
  return pending
}

/** The initialized kernel. Throws if initKernel() hasn't resolved yet. */
export function kernel(): ManifoldToplevel {
  if (!toplevel) throw new Error('Manifold kernel not initialized')
  return toplevel
}

export function kernelReady(): boolean {
  return toplevel !== null
}
