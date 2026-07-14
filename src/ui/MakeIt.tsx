// The "Make It…" sheet: the single place all output leaves the app.
// Cut list (print), STL, DXF shop drawing, project file, and — tucked behind
// a quiet expander — an OpenSCAD file. The hero is a live turntable preview
// of exactly what will be made.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { evaluateExport, topOutline } from '../engine/evaluate'
import { positionsToGeometry } from '../engine/toThree'
import { exportSTL } from '../exporters/stl'
import { exportDXF } from '../exporters/dxf'
import { exportSCAD } from '../exporters/scad'
import { cutListHTML } from '../exporters/cutlist'
import { serializeDoc, useStore } from '../model/store'
import { useBus } from '../viewport/bus'
import { printHTML, saveBlob } from './files'
import { baseName, isNative } from './native'

/** Project name -> a safe file name like "Garden bench.stl". */
function makeFilename(name: string, ext: string): string {
  const safe = name.trim().replace(/[/\\:*?"<>|]/g, '-')
  return (safe || 'workbench-project') + '.' + ext
}

/** Kernel jargon never reaches the user. */
function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/nothing solid|cut away everything/i.test(raw)) return raw
  if (/NotManifold|NonFinite|Geometry problem/i.test(raw)) {
    return "The shapes couldn't be combined into one solid piece. Try undoing your last change, or slide overlapping pieces apart."
  }
  return raw
}

export function MakeItSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kernelState = useBus((s) => s.kernelState)
  const doc = useStore((s) => s.doc)
  const [positions, setPositions] = useState<Float32Array | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const previewHost = useRef<HTMLDivElement | null>(null)

  const ready = kernelState === 'ready'

  // Evaluate the export geometry when the sheet opens, and re-evaluate if the
  // document changes while it is open (undo, delete) — preview, STL, and cut
  // list must never disagree.
  useEffect(() => {
    if (!open || !ready) {
      setPositions(null)
      setEvalError(null)
      setShowMore(false)
      return
    }
    try {
      const r = evaluateExport(doc)
      setPositions(r.positions)
      setEvalError(null)
    } catch (e) {
      setPositions(null)
      setEvalError(friendlyError(e))
    }
  }, [open, ready, doc])

  // The hero preview: a small dedicated three.js turntable.
  useEffect(() => {
    const host = previewHost.current
    if (!host || !positions) return

    const width = host.clientWidth || 640
    const height = host.clientHeight || 260

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()

    const geometry = positionsToGeometry(positions)
    const material = new THREE.MeshStandardMaterial({ color: '#c9a06a', roughness: 0.75 })
    const mesh = new THREE.Mesh(geometry, material)
    // Export geometry is Z-up; stand it upright in three's y-up preview.
    mesh.rotation.x = -Math.PI / 2

    // Center the piece on the origin so the turntable spins it in place.
    const turntable = new THREE.Group()
    turntable.add(mesh)
    scene.add(turntable)
    const box = new THREE.Box3().setFromObject(mesh)
    const center = box.getCenter(new THREE.Vector3())
    mesh.position.sub(center)

    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 1)

    const camera = new THREE.PerspectiveCamera(38, width / height, maxDim / 100, maxDim * 20)
    const dist = maxDim * 1.9
    camera.position.set(dist * 0.7, dist * 0.55, dist * 0.85)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a5f, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(maxDim * 2, maxDim * 3, maxDim * 1.5)
    scene.add(sun)

    let raf = 0
    const animate = () => {
      turntable.rotation.y += 0.004 // soft, slow turn
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      // release the GL context immediately — repeatedly opening the sheet
      // must never starve the main viewport of contexts
      renderer.forceContextLoss()
      geometry.dispose()
      material.dispose()
      renderer.domElement.remove()
    }
  }, [positions])

  if (!open) return null

  const modelBlocked = !ready || evalError !== null || positions === null

  const saveAndToast = async (
    filename: string,
    data: ArrayBuffer | string,
    mime: string,
    filters?: { name: string; extensions: string[] }[],
  ) => {
    const written = await saveBlob(filename, data, mime, filters)
    // null = the user cancelled the save dialog; say nothing
    if (written === null) return
    useBus.getState().toast('Saved ' + (written ? baseName(written) : filename))
  }

  const doCutList = () => {
    printHTML(cutListHTML(useStore.getState().doc))
  }

  const doSTL = () => {
    if (!positions) return
    const name = makeFilename(useStore.getState().doc.name, 'stl')
    void saveAndToast(name, exportSTL(positions), 'model/stl', [
      { name: '3D print file', extensions: ['stl'] },
    ])
  }

  const doDXF = () => {
    const doc = useStore.getState().doc
    let contours: [number, number][][]
    try {
      contours = topOutline(doc)
    } catch (e) {
      useBus.getState().toast(friendlyError(e))
      return
    }
    const name = makeFilename(doc.name, 'dxf')
    void saveAndToast(name, exportDXF(contours), 'application/dxf', [
      { name: 'Shop drawing', extensions: ['dxf'] },
    ])
  }

  const doProjectFile = () => {
    const doc = useStore.getState().doc
    const name = makeFilename(doc.name, isNative ? 'workbench' : 'workbench.json')
    void saveAndToast(name, serializeDoc(doc), 'application/json', [
      { name: 'Workbench Project', extensions: ['workbench'] },
    ])
  }

  const doSCAD = () => {
    const doc = useStore.getState().doc
    const name = makeFilename(doc.name, 'scad')
    void saveAndToast(name, exportSCAD(doc), 'text/plain', [
      { name: 'OpenSCAD file', extensions: ['scad'] },
    ])
  }

  return (
    <div className="wb-sheet-backdrop" onClick={onClose}>
      <div className="wb-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="wb-sheet-close" onClick={onClose}>
          ✕ Close
        </button>
        <h2>Make It</h2>

        {!ready ? (
          <div className="wb-note">Still getting ready… one moment.</div>
        ) : evalError !== null ? (
          <div className="wb-note bad">{evalError}</div>
        ) : (
          <div>
            <div className="wb-makeit-preview" ref={previewHost} />
            <div className="wb-makeit-caption">This is what will be made</div>
          </div>
        )}

        <div className="rows">
          <button className="wb-sheet-row" onClick={doCutList} disabled={!ready}>
            <span>
              Cut List — the boards you&rsquo;ll need
              <span className="sub">Opens a printable page</span>
            </span>
          </button>

          <button className="wb-sheet-row" onClick={doSTL} disabled={modelBlocked}>
            <span>
              For your 3D printer
              <span className="sub">Saves an STL file</span>
            </span>
          </button>

          <button className="wb-sheet-row" onClick={doDXF} disabled={modelBlocked}>
            <span>
              Shop Drawing
              <span className="sub">Saves a DXF outline for a fabrication shop (viewed from above)</span>
            </span>
          </button>

          <button className="wb-sheet-row" onClick={doProjectFile}>
            <span>
              Save a copy of this project
              <span className="sub">A file you can keep or send</span>
            </span>
          </button>
        </div>

        {!showMore ? (
          <button className="wb-btn small" onClick={() => setShowMore(true)}>
            More formats
          </button>
        ) : (
          <div className="rows">
            <button className="wb-sheet-row" onClick={doSCAD} disabled={evalError !== null}>
              <span>
                OpenSCAD file — for programmers
                <span className="sub">Saves a .scad file</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
