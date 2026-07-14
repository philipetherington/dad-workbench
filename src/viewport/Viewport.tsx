// React shell around the imperative World. Also owns the out-of-view
// watchdog button ("Bring my project back into view").

import { useEffect, useRef, useState } from 'react'
import { World } from './world'
import { useBus } from './bus'

export function Viewport() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [lost, setLost] = useState(false)
  const camera = useBus((s) => s.camera)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const world = new World(mount)
    const ro = new ResizeObserver(() => world.resize())
    ro.observe(mount)
    const lostTimer = window.setInterval(() => setLost(world.isLost(performance.now())), 500)
    return () => {
      window.clearInterval(lostTimer)
      ro.disconnect()
      world.dispose()
    }
  }, [])

  return (
    <div className="wb-viewport" ref={mountRef}>
      {lost && camera && (
        <button
          className="wb-lost-button"
          onClick={() => camera.showEverything()}
        >
          Bring my project back into view
        </button>
      )}
    </div>
  )
}
