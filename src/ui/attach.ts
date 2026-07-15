// Automatic attachment: after a cut or hardware item MOVES (drag or nudge),
// it belongs to whichever solid it now overlaps most — or to nothing.
// Bboxes come from the latest engine evaluation on the bus.

import { useBus } from '../viewport/bus'
import { useStore } from '../model/store'

export function autoAttach(movedIds: string[]): void {
  const result = useBus.getState().result
  if (!result) return
  const store = useStore.getState()
  const doc = store.doc
  const bbox = new Map(result.parts.map((p) => [p.id, p.bbox]))

  for (const id of movedIds) {
    const part = doc.parts.find((p) => p.id === id)
    if (!part || (part.role !== 'hole' && part.role !== 'hardware')) continue
    // its host moved with it: the pair stays intact
    if (part.hostId && movedIds.includes(part.hostId)) continue
    const myBox = bbox.get(id)
    if (!myBox) continue

    let best: { hostId: string; volume: number } | null = null
    for (const solid of doc.parts) {
      if (solid.role !== 'solid' || movedIds.includes(solid.id)) continue
      const sb = bbox.get(solid.id)
      if (!sb) continue
      const ov = [0, 1, 2].map(
        (i) => Math.min(myBox.max[i], sb.max[i]) - Math.max(myBox.min[i], sb.min[i]),
      )
      if (ov.some((v) => v <= 0)) continue
      const volume = ov[0] * ov[1] * ov[2]
      if (!best || volume > best.volume) best = { hostId: solid.id, volume }
    }
    store.attachPart(id, best ? best.hostId : null)
  }
}
