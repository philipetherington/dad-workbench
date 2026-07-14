// The 3D world: rendering, picking, and the four drag interactions
// (orbit, move, resize, lift). One instance is mounted by Viewport.tsx.
//
// Interaction contract (from the UX spec, do not drift):
//   click selects · body-drag slides on the bench · the lift arrow raises ·
//   face handles resize one dimension · background-drag turns the view.
//   Snapping is always on: grid snap plus face magnetism with a "Flush!" flash.

import * as THREE from 'three'
import type { Doc, Part } from '../model/types'
import { DIM_SPECS, clampDims, localSize, worldBottomOffset } from '../model/types'
import { formatLength, snap } from '../model/units'
import { useStore } from '../model/store'
import { evaluateScene } from '../engine/evaluate'
import { positionsToGeometry } from '../engine/toThree'
import { kernelReady } from '../engine/kernel'
import { useBus } from './bus'
import { CameraRig } from './CameraRig'
import { benchTexture, stripeTexture, BENCH_SIZE } from './textures'
import { buildHandles, buildLiftHandle, type HandleSpec } from './handles'

const MAGNET_MM = 6.35 // 1/4" capture radius for face magnetism
const SELECT_ORANGE = new THREE.Color('#ff7a1a')
const OVERLAP_AMBER = new THREE.Color('#d99a00')

/** Dispose every geometry/material in a subtree (textures are shared; not touched). */
function disposeSubtree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else if (mat) mat.dispose()
  })
}

interface PartVisual {
  mesh: THREE.Mesh
  edges: THREE.LineSegments | null
}

type Drag =
  | { kind: 'orbit'; lastX: number; lastY: number; startX: number; startY: number; moved: boolean }
  | { kind: 'maybe-move'; partId: string; startX: number; startY: number; shift: boolean }
  | {
      kind: 'move'
      ids: string[]
      plane: THREE.Plane
      startHit: THREE.Vector3
      startPositions: Map<string, [number, number, number]>
      grabbedId: string
      startBBox: { min: [number, number, number]; max: [number, number, number] }
      lastFlushKey: string | null
    }
  | {
      kind: 'resize'
      partId: string
      spec: HandleSpec
      axisWorld: THREE.Vector3
      plane: THREE.Plane
      startHit: THREE.Vector3
      startDim: number
      startPos: [number, number, number]
    }
  | {
      kind: 'lift'
      ids: string[]
      startClientY: number
      worldPerPixel: number
      startPositions: Map<string, [number, number, number]>
      maxDrop: number
    }

export class World {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private rig: CameraRig
  private raycaster = new THREE.Raycaster()
  private mount: HTMLElement
  private labelLayer: HTMLElement

  private sun!: THREE.DirectionalLight
  private benchGroup = new THREE.Group()
  private benchUnits: string | null = null
  private partsGroup = new THREE.Group()
  private visuals = new Map<string, PartVisual>()
  private handleGroup: THREE.Group | null = null
  private handlePartId: string | null = null
  private liftHandle = buildLiftHandle()
  private dropLine: THREE.Line
  private stripes = stripeTexture()

  private drag: Drag | null = null
  private dragPointerId: number | null = null
  private evalQueued = false
  private evalDirty = true
  private disposed = false
  private lastTime = 0
  private outOfViewSince: number | null = null
  private labels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = []
  private unsubs: (() => void)[] = []

  constructor(mount: HTMLElement) {
    this.mount = mount
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor('#e9e4dc')
    mount.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'

    this.labelLayer = document.createElement('div')
    this.labelLayer.className = 'wb-label-layer'
    mount.appendChild(this.labelLayer)

    this.rig = new CameraRig(1)
    this.scene.fog = new THREE.Fog('#e9e4dc', 6000, 16000)

    // lights — the sun's shadow frustum is refitted to the work every time the
    // scene changes (a fixed, bench-sized frustum wastes almost all of the
    // shadow map on empty wood and shows as banding across the benchtop)
    const hemi = new THREE.HemisphereLight('#fdf6ea', '#9a8a76', 1.05)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight('#fff2dc', 1.6)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    this.scene.add(sun)
    this.scene.add(sun.target)
    this.sun = sun

    this.scene.add(this.benchGroup)
    this.scene.add(this.partsGroup)
    this.liftHandle.visible = false
    this.scene.add(this.liftHandle)

    const dropGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    this.dropLine = new THREE.Line(
      dropGeo,
      new THREE.LineDashedMaterial({ color: '#b26a00', dashSize: 12, gapSize: 8, transparent: true, opacity: 0.9 }),
    )
    this.dropLine.visible = false
    this.scene.add(this.dropLine)

    // events
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('dblclick', this.onDblClick)
    el.addEventListener('contextmenu', this.onContextMenu)

    // camera API for the view strip
    useBus.getState().setCamera({
      goTo: (v) => this.rig.goTo(v),
      spin: (deg) => this.rig.spin(deg),
      zoom: (f) => this.rig.zoom(f),
      showEverything: () => this.showEverything(),
      focusOn: (id) => this.focusOn(id),
      yawDeg: () => (this.rig.yawNow * 180) / Math.PI,
    })

    // react to state changes
    this.unsubs.push(
      useStore.subscribe((s, prev) => {
        if (s.doc !== prev.doc) this.markDirty()
        if (s.selection !== prev.selection || s.doc !== prev.doc) this.refreshSelectionVisuals()
      }),
    )
    this.unsubs.push(
      useBus.subscribe((s, prev) => {
        if (s.showCutouts !== prev.showCutouts) this.applyCutoutVisibility()
        if (s.kernelState === 'ready' && prev.kernelState !== 'ready') this.markDirty()
        if (s.hoveredId !== prev.hoveredId) this.applyHoverTint()
      }),
    )

    this.resize()
    this.showEverything(false)
    requestAnimationFrame(this.frame)
  }

  dispose() {
    this.disposed = true
    for (const u of this.unsubs) u()
    useBus.getState().setCamera(null)
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointercancel', this.onPointerUp)
    el.removeEventListener('wheel', this.onWheel)
    el.removeEventListener('dblclick', this.onDblClick)
    el.removeEventListener('contextmenu', this.onContextMenu)
    for (const v of this.visuals.values()) this.disposeVisual(v)
    if (this.handleGroup) disposeSubtree(this.handleGroup)
    disposeSubtree(this.liftHandle)
    disposeSubtree(this.benchGroup)
    this.dropLine.geometry.dispose()
    ;(this.dropLine.material as THREE.Material).dispose()
    this.stripes.dispose()
    this.renderer.dispose()
    this.mount.removeChild(this.renderer.domElement)
    this.mount.removeChild(this.labelLayer)
  }

  private onContextMenu = (e: Event) => e.preventDefault()

  resize = () => {
    const w = this.mount.clientWidth || 1
    const h = this.mount.clientHeight || 1
    this.renderer.setSize(w, h)
    this.rig.setAspect(w / h)
  }

  // ------------------------------------------------------------- evaluation

  private markDirty() {
    this.evalDirty = true
  }

  private runEval() {
    if (!kernelReady()) return
    const doc = useStore.getState().doc
    this.rebuildBenchIfNeeded(doc)
    const result = evaluateScene(doc)
    useBus.getState().setResult(result)

    const seen = new Set<string>()
    for (const p of result.parts) {
      seen.add(p.id)
      let vis = this.visuals.get(p.id)
      const part = doc.parts.find((q) => q.id === p.id)!
      if (!vis) {
        const mat =
          part.role === 'hole'
            ? new THREE.MeshStandardMaterial({
                map: this.stripes,
                transparent: true,
                opacity: 0.75,
                depthWrite: false,
                roughness: 0.6,
                side: THREE.DoubleSide,
              })
            : new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02 })
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
        mesh.castShadow = part.role === 'solid'
        mesh.receiveShadow = part.role === 'solid'
        mesh.userData.partId = p.id
        vis = { mesh, edges: null }
        this.visuals.set(p.id, vis)
        this.partsGroup.add(mesh)
      }
      vis.mesh.geometry.dispose()
      vis.mesh.geometry = positionsToGeometry(p.positions)
      if (part.role === 'hole') {
        // stripe UVs: project along world X/Y so stripes stay a steady size
        const pos = p.positions
        const uv = new Float32Array((pos.length / 3) * 2)
        for (let i = 0; i < pos.length / 3; i++) {
          uv[i * 2] = (pos[i * 3] + pos[i * 3 + 2]) / 40
          uv[i * 2 + 1] = pos[i * 3 + 1] / 40
        }
        vis.mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      }
      vis.mesh.userData.bbox = p.bbox
      vis.mesh.userData.role = p.role
    }
    for (const [id, vis] of this.visuals) {
      if (!seen.has(id)) {
        this.disposeVisual(vis)
        this.visuals.delete(id)
      }
    }
    this.applyCutoutVisibility()
    this.refreshSelectionVisuals()
    this.fitSunToScene()
    if (!this.drag) this.rig.driftTargetToward(this.sceneBBox())
  }

  /**
   * Aim the sun at the work.
   *
   * The frustum must cover every surface that RECEIVES a shadow, not just the
   * pieces that cast one: fragments outside it sample the shadow map's clamped
   * edge texel, which paints a staircase of fake shadow across the benchtop.
   * The whole bench receives, so the frustum never shrinks below the bench —
   * it only grows, for projects bigger than the bench itself.
   */
  private fitSunToScene() {
    const box = this.sceneBBox()
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 150)
    const ext = Math.max(BENCH_SIZE / 2 + 60, radius * 1.4)

    const dir = new THREE.Vector3(0.55, 1.15, 0.42).normalize()
    const distance = Math.max(ext * 2.2, radius * 3)
    // keep the sun centred over the BENCH, not the work, so the frustum that
    // covers the bench stays put and the shadows don't swim as pieces move
    const pivot = new THREE.Vector3(center.x * 0.25, 0, center.z * 0.25)
    this.sun.position.copy(pivot).addScaledVector(dir, distance)
    this.sun.target.position.copy(pivot)
    this.sun.target.updateMatrixWorld()

    const cam = this.sun.shadow.camera
    cam.left = -ext
    cam.right = ext
    cam.top = ext
    cam.bottom = -ext
    cam.near = distance * 0.15
    cam.far = distance + ext * 3
    cam.updateProjectionMatrix()

    // World units are millimetres. The depth bias has to be scaled to that or
    // the benchtop self-shadows in bands; normalBias does the real work here.
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 1.8
  }

  private disposeVisual(v: PartVisual) {
    v.mesh.geometry.dispose()
    ;(v.mesh.material as THREE.Material).dispose()
    this.partsGroup.remove(v.mesh)
    if (v.edges) {
      v.edges.geometry.dispose()
      ;(v.edges.material as THREE.Material).dispose()
      this.partsGroup.remove(v.edges)
    }
  }

  private rebuildBenchIfNeeded(doc: Doc) {
    if (this.benchUnits === doc.units) return
    this.benchUnits = doc.units
    for (const child of [...this.benchGroup.children]) {
      this.benchGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const m = child.material as THREE.MeshStandardMaterial
        m.map?.dispose()
        m.dispose()
      }
    }
    const tex = benchTexture(doc.units)
    const bench = new THREE.Mesh(
      new THREE.PlaneGeometry(BENCH_SIZE, BENCH_SIZE),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    )
    bench.rotation.x = -Math.PI / 2
    bench.position.y = -0.5 // avoid z-fighting with part bottoms at y=0
    bench.receiveShadow = true
    this.benchGroup.add(bench)
    // apron so the bench reads as a physical object
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(BENCH_SIZE, 90, BENCH_SIZE),
      new THREE.MeshStandardMaterial({ color: '#9c7c58', roughness: 0.9 }),
    )
    apron.position.y = -46
    this.benchGroup.add(apron)
  }

  // ------------------------------------------------------------- selection visuals

  private refreshSelectionVisuals() {
    const { selection } = useStore.getState()
    const bus = useBus.getState()
    const doc = useStore.getState().doc
    const overlapIds = new Set((bus.result?.overlaps ?? []).flat())

    for (const [id, vis] of this.visuals) {
      const part = doc.parts.find((p) => p.id === id)
      if (!part) continue
      const mat = vis.mesh.material as THREE.MeshStandardMaterial
      const selected = selection.includes(id)
      if (part.role === 'solid') {
        mat.color.set(part.color)
        mat.emissive.set(
          selected ? SELECT_ORANGE : overlapIds.has(id) ? OVERLAP_AMBER : '#000000',
        )
        mat.emissiveIntensity = selected ? 0.22 : overlapIds.has(id) ? 0.35 : 0
      } else {
        mat.opacity = selected ? 0.9 : 0.75
      }
      // orange edge outline for selected parts
      if (selected && !vis.edges) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(vis.mesh.geometry, 25),
          new THREE.LineBasicMaterial({ color: SELECT_ORANGE, linewidth: 2 }),
        )
        edges.renderOrder = 900
        vis.edges = edges
        this.partsGroup.add(edges)
      } else if (selected && vis.edges) {
        vis.edges.geometry.dispose()
        vis.edges.geometry = new THREE.EdgesGeometry(vis.mesh.geometry, 25)
      } else if (!selected && vis.edges) {
        vis.edges.geometry.dispose()
        ;(vis.edges.material as THREE.Material).dispose()
        this.partsGroup.remove(vis.edges)
        vis.edges = null
      }
    }
    this.applyHoverTint()
    this.rebuildHandles()
    this.rebuildLabels()
  }

  private applyHoverTint() {
    const hovered = useBus.getState().hoveredId
    const { selection, doc } = useStore.getState()
    for (const [id, vis] of this.visuals) {
      const part = doc.parts.find((p) => p.id === id)
      if (!part || part.role !== 'solid' || selection.includes(id)) continue
      const mat = vis.mesh.material as THREE.MeshStandardMaterial
      const overlapIds = new Set((useBus.getState().result?.overlaps ?? []).flat())
      if (id === hovered) {
        mat.emissive.set(SELECT_ORANGE)
        mat.emissiveIntensity = 0.1
      } else if (!overlapIds.has(id)) {
        mat.emissiveIntensity = 0
      }
    }
  }

  private applyCutoutVisibility() {
    const show = useBus.getState().showCutouts
    for (const [, vis] of this.visuals) {
      if (vis.mesh.userData.role === 'hole') vis.mesh.visible = show
    }
  }

  private rebuildHandles() {
    const { selection, doc } = useStore.getState()
    if (this.handleGroup) {
      this.scene.remove(this.handleGroup)
      disposeSubtree(this.handleGroup)
      this.handleGroup = null
      this.handlePartId = null
    }
    const single = selection.length === 1 ? doc.parts.find((p) => p.id === selection[0]) : undefined
    if (single && !single.locked) {
      this.handleGroup = buildHandles(single)
      this.syncHandleTransform(single)
      this.scene.add(this.handleGroup)
      this.handlePartId = single.id
    }
    this.liftHandle.visible = selection.length > 0 && !!this.selectionBBox()
  }

  private syncHandleTransform(part: Part) {
    if (!this.handleGroup) return
    this.handleGroup.position.set(...part.position)
    const [rx, ry, rz] = part.rotation.map((d) => (d * Math.PI) / 180)
    this.handleGroup.rotation.set(rx, ry, rz, 'XYZ')
  }

  // ------------------------------------------------------------- labels

  private rebuildLabels() {
    for (const l of this.labels) l.el.remove()
    this.labels = []
    const { selection, doc } = useStore.getState()
    if (selection.length !== 1 || this.drag) return
    const part = doc.parts.find((p) => p.id === selection[0])
    const vis = part && this.visuals.get(part.id)
    if (!part || !vis) return
    const bbox = vis.mesh.userData.bbox as { min: number[]; max: number[] } | undefined
    if (!bbox) return
    const center = new THREE.Vector3(
      (bbox.min[0] + bbox.max[0]) / 2,
      (bbox.min[1] + bbox.max[1]) / 2,
      (bbox.min[2] + bbox.max[2]) / 2,
    )
    const size = localSize(part)
    const R = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(...(part.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]), 'XYZ'),
    )
    for (const spec of DIM_SPECS[part.kind]) {
      const el = document.createElement('div')
      el.className = 'wb-dim-label'
      el.textContent = `${formatLength(part.dims[spec.key], doc.units)}`
      this.labelLayer.appendChild(el)
      const local = new THREE.Vector3()
      if (spec.axis !== undefined) {
        // midpoint of the top-ish edge along this axis
        const other = spec.axis === 1 ? 0 : 1
        local.setComponent(spec.axis, 0)
        local.setComponent(other, size[other] / 2)
      } else {
        local.set(size[0] / 2, 0, 0)
      }
      const world = local.applyMatrix4(R).add(new THREE.Vector3(...part.position))
      this.labels.push({ el, pos: world })
    }
    void center
  }

  private updateLabelPositions() {
    const w = this.mount.clientWidth
    const h = this.mount.clientHeight
    for (const l of this.labels) {
      const p = l.pos.clone().project(this.rig.camera)
      if (p.z > 1) {
        l.el.style.display = 'none'
        continue
      }
      l.el.style.display = 'block'
      l.el.style.left = `${((p.x + 1) / 2) * w}px`
      l.el.style.top = `${((1 - p.y) / 2) * h}px`
    }
  }

  // ------------------------------------------------------------- bbox helpers

  private sceneBBox(): THREE.Box3 {
    const box = new THREE.Box3()
    let any = false
    for (const [, vis] of this.visuals) {
      const b = vis.mesh.userData.bbox as { min: number[]; max: number[] } | undefined
      if (!b) continue
      box.expandByPoint(new THREE.Vector3(...b.min))
      box.expandByPoint(new THREE.Vector3(...b.max))
      any = true
    }
    if (!any) box.set(new THREE.Vector3(-400, 0, -400), new THREE.Vector3(400, 300, 400))
    return box
  }

  private selectionBBox(): THREE.Box3 | null {
    const { selection } = useStore.getState()
    const box = new THREE.Box3()
    let any = false
    for (const id of selection) {
      const b = this.visuals.get(id)?.mesh.userData.bbox as { min: number[]; max: number[] } | undefined
      if (!b) continue
      box.expandByPoint(new THREE.Vector3(...b.min))
      box.expandByPoint(new THREE.Vector3(...b.max))
      any = true
    }
    return any ? box : null
  }

  private showEverything(animate = true) {
    this.rig.fit(this.sceneBBox(), animate)
    this.rig.goTo('corner')
  }

  private focusOn(id: string) {
    const b = this.visuals.get(id)?.mesh.userData.bbox as { min: number[]; max: number[] } | undefined
    if (!b) return
    this.rig.lookAtPoint(
      new THREE.Vector3(
        (b.min[0] + b.max[0]) / 2,
        (b.min[1] + b.max[1]) / 2,
        (b.min[2] + b.max[2]) / 2,
      ),
    )
  }

  // ------------------------------------------------------------- pointer helpers

  private pointerRay(e: PointerEvent | MouseEvent): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.rig.camera)
    return this.raycaster
  }

  private hitHandles(e: PointerEvent): THREE.Intersection | null {
    const ray = this.pointerRay(e)
    const targets: THREE.Object3D[] = []
    if (this.handleGroup) targets.push(this.handleGroup)
    if (this.liftHandle.visible) targets.push(this.liftHandle)
    const hits = ray.intersectObjects(targets, true)
    return hits[0] ?? null
  }

  private hitParts(e: PointerEvent | MouseEvent): THREE.Intersection[] {
    const ray = this.pointerRay(e)
    const meshes = [...this.visuals.values()].map((v) => v.mesh).filter((m) => m.visible)
    return ray.intersectObjects(meshes, false)
  }

  // ------------------------------------------------------------- pointer events

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return
    // a second finger/button must never clobber a live drag
    if (this.drag) return
    this.dragPointerId = e.pointerId
    this.renderer.domElement.setPointerCapture(e.pointerId)
    const store = useStore.getState()

    const handleHit = e.button === 0 ? this.hitHandles(e) : null
    if (handleHit) {
      const ud = handleHit.object.userData
      if (ud.lift) {
        this.beginLift(e)
        return
      }
      if (ud.handle) {
        this.beginResize(e, ud.partId as string, ud.handle as HandleSpec, handleHit.point)
        return
      }
    }

    const partHits = this.hitParts(e)
    if (partHits.length > 0 && e.button === 0) {
      const id = partHits[0].object.userData.partId as string
      this.drag = { kind: 'maybe-move', partId: id, startX: e.clientX, startY: e.clientY, shift: e.shiftKey }
      return
    }

    // background: turntable
    this.drag = {
      kind: 'orbit',
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    this.renderer.domElement.style.cursor = 'grabbing'
    void store
  }

  private beginMove(e: PointerEvent, partId: string) {
    const store = useStore.getState()
    const doc = store.doc
    const part = doc.parts.find((p) => p.id === partId)
    if (!part) return
    if (part.locked) {
      useBus.getState().flash('This piece is held in place')
      this.drag = null
      return
    }
    let ids = store.selection.includes(partId) ? [...store.selection] : [partId]
    if (!store.selection.includes(partId)) store.select([partId])
    ids = useStore.getState().selection.filter(
      (id) => !doc.parts.find((p) => p.id === id)?.locked,
    )
    const bbox = this.visuals.get(partId)?.mesh.userData.bbox as
      | { min: [number, number, number]; max: [number, number, number] }
      | undefined
    if (!bbox) return
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -bbox.min[1])
    const hit = new THREE.Vector3()
    if (!this.pointerRay(e).ray.intersectPlane(plane, hit)) return
    const startPositions = new Map<string, [number, number, number]>()
    for (const id of ids) {
      const p = doc.parts.find((q) => q.id === id)
      if (p) startPositions.set(id, [...p.position])
    }
    store.startDrag()
    this.drag = {
      kind: 'move',
      ids,
      plane,
      startHit: hit,
      startPositions,
      grabbedId: partId,
      startBBox: bbox,
      lastFlushKey: null,
    }
  }

  private beginResize(_e: PointerEvent, partId: string, spec: HandleSpec, hitPoint: THREE.Vector3) {
    const store = useStore.getState()
    const part = store.doc.parts.find((p) => p.id === partId)
    if (!part) return
    const R = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(...(part.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]), 'XYZ'),
    )
    const axisWorld = new THREE.Vector3()
      .setComponent(spec.axis, 1)
      .applyMatrix4(R)
      .normalize()
    // drag plane: contains the axis, faces the camera as much as possible
    const camDir = this.rig.camera.getWorldDirection(new THREE.Vector3())
    let normal = new THREE.Vector3().crossVectors(axisWorld, new THREE.Vector3().crossVectors(axisWorld, camDir))
    if (normal.lengthSq() < 1e-6) normal = camDir.clone()
    normal.normalize()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hitPoint)
    store.startDrag()
    this.drag = {
      kind: 'resize',
      partId,
      spec,
      axisWorld,
      plane,
      startHit: hitPoint.clone(),
      startDim: part.dims[spec.dimKey],
      startPos: [...part.position],
    }
  }

  private beginLift(e: PointerEvent) {
    const store = useStore.getState()
    const doc = store.doc
    const ids = store.selection.filter((id) => !doc.parts.find((p) => p.id === id)?.locked)
    if (ids.length === 0) return
    // Screen-space lift: ~1 mm per pixel at default zoom, at EVERY camera
    // pitch. (A vertical drag plane goes degenerate near the Top view and
    // flings parts hundreds of mm per pixel.)
    const worldPerPixel =
      (2 * this.rig.getDist() * Math.tan((this.rig.camera.fov * Math.PI) / 360)) /
      Math.max(this.renderer.domElement.clientHeight, 1)
    const startPositions = new Map<string, [number, number, number]>()
    let minBottom = Infinity
    for (const id of ids) {
      const p = doc.parts.find((q) => q.id === id)
      const b = this.visuals.get(id)?.mesh.userData.bbox as { min: number[] } | undefined
      if (!p || !b) continue
      startPositions.set(id, [...p.position])
      minBottom = Math.min(minBottom, b.min[1])
    }
    store.startDrag()
    this.drag = {
      kind: 'lift',
      ids,
      startClientY: e.clientY,
      worldPerPixel,
      startPositions,
      maxDrop: minBottom,
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    const bus = useBus.getState()
    if (this.drag && this.dragPointerId !== null && e.pointerId !== this.dragPointerId) return
    if (!this.drag) {
      // hover feedback
      const hits = this.hitParts(e)
      const id = hits.length > 0 ? (hits[0].object.userData.partId as string) : null
      if (id !== bus.hoveredId) bus.setHoveredId(id)
      this.renderer.domElement.style.cursor = id
        ? 'pointer'
        : this.hitHandles(e)
          ? 'pointer'
          : 'grab'
      return
    }

    const store = useStore.getState()
    const doc = store.doc

    if (this.drag.kind === 'orbit') {
      // same 5px slop as part clicks: a jittery deselect click stays a click
      if (
        !this.drag.moved &&
        Math.abs(e.clientX - this.drag.startX) + Math.abs(e.clientY - this.drag.startY) > 5
      ) {
        this.drag.moved = true
        useBus.getState().setActiveView(null)
      }
      const dx = e.clientX - this.drag.lastX
      const dy = e.clientY - this.drag.lastY
      this.drag.lastX = e.clientX
      this.drag.lastY = e.clientY
      if (this.drag.moved) this.rig.orbitBy(-dx * 0.005, dy * 0.004)
      return
    }

    if (this.drag.kind === 'maybe-move') {
      const moved =
        Math.abs(e.clientX - this.drag.startX) + Math.abs(e.clientY - this.drag.startY) > 5
      if (moved) this.beginMove(e, this.drag.partId)
      return
    }

    if (this.drag.kind === 'move') {
      const hit = new THREE.Vector3()
      if (!this.pointerRay(e).ray.intersectPlane(this.drag.plane, hit)) return
      const step = doc.snapStep
      let dx = snap(hit.x - this.drag.startHit.x, step)
      let dz = snap(hit.z - this.drag.startHit.z, step)

      // face magnetism against parts not being moved
      const sb = this.drag.startBBox
      const movedBox = {
        min: [sb.min[0] + dx, sb.min[1], sb.min[2] + dz],
        max: [sb.max[0] + dx, sb.max[1], sb.max[2] + dz],
      }
      let flushKey: string | null = null
      for (const axis of [0, 2] as const) {
        let best: { corr: number; key: string; contact: boolean } | null = null
        for (const [oid, vis] of this.visuals) {
          if (this.drag.ids.includes(oid)) continue
          const ob = vis.mesh.userData.bbox as { min: number[]; max: number[] } | undefined
          if (!ob || vis.mesh.userData.role !== 'solid') continue
          const combos: [number, number, string, boolean][] = [
            [movedBox.min[axis], ob.max[axis], 'contact', true],
            [movedBox.max[axis], ob.min[axis], 'contact2', true],
            [movedBox.min[axis], ob.min[axis], 'align-min', false],
            [movedBox.max[axis], ob.max[axis], 'align-max', false],
            [
              (movedBox.min[axis] + movedBox.max[axis]) / 2,
              (ob.min[axis] + ob.max[axis]) / 2,
              'center',
              false,
            ],
          ]
          for (const [mine, theirs, tag, contact] of combos) {
            const corr = theirs - mine
            if (Math.abs(corr) < MAGNET_MM && (!best || Math.abs(corr) < Math.abs(best.corr))) {
              best = { corr, key: `${axis}:${oid}:${tag}`, contact }
            }
          }
        }
        if (best) {
          if (axis === 0) dx += best.corr
          else dz += best.corr
          if (best.contact) flushKey = best.key
        }
      }
      if (flushKey && flushKey !== this.drag.lastFlushKey) useBus.getState().flash('Flush!')
      this.drag.lastFlushKey = flushKey

      const startPositions = this.drag.startPositions
      const ids = this.drag.ids
      store.mutate(
        (d) => {
          for (const p of d.parts) {
            const sp = startPositions.get(p.id)
            if (sp && ids.includes(p.id)) {
              p.position = [sp[0] + dx, sp[1], sp[2] + dz]
            }
          }
        },
        { history: false },
      )
      const total = Math.hypot(dx, dz)
      bus.setDragReadout(total > 0.01 ? `moved ${formatLength(total, doc.units)}` : null)
      return
    }

    if (this.drag.kind === 'resize') {
      const drag = this.drag
      const hit = new THREE.Vector3()
      if (!this.pointerRay(e).ray.intersectPlane(drag.plane, hit)) return
      const part = doc.parts.find((p) => p.id === drag.partId)
      if (!part) return
      const delta = hit.clone().sub(drag.startHit).dot(drag.axisWorld)
      const spec = DIM_SPECS[part.kind].find((s) => s.key === drag.spec.dimKey)
      const factor = drag.spec.radial ? 2 : 1
      const raw = drag.startDim + delta * drag.spec.sign * factor
      const snapped = Math.max(
        spec?.min ?? 0.5,
        snap(raw, doc.snapStep),
      )
      const newDims = clampDims(part.kind, { ...part.dims, [drag.spec.dimKey]: snapped })
      const applied = newDims[drag.spec.dimKey]
      store.mutate(
        (d) => {
          const p = d.parts.find((q) => q.id === drag.partId)
          if (!p) return
          p.dims = newDims
          if (!drag.spec.radial) {
            // grow from the anchored opposite face
            const growth = applied - drag.startDim
            const dir = drag.axisWorld
            p.position = [
              drag.startPos[0] + (dir.x * growth * drag.spec.sign) / 2,
              drag.startPos[1] + (dir.y * growth * drag.spec.sign) / 2,
              drag.startPos[2] + (dir.z * growth * drag.spec.sign) / 2,
            ]
          }
          // nothing resizes down through the bench
          const floor = worldBottomOffset(p)
          if (p.position[1] < floor) p.position[1] = floor
        },
        { history: false },
      )
      bus.setDragReadout(formatLength(applied, doc.units))
      if (this.handleGroup && this.handlePartId === drag.partId) {
        const p = useStore.getState().doc.parts.find((q) => q.id === drag.partId)
        if (p) {
          // rebuild handle positions for the new size
          this.scene.remove(this.handleGroup)
          disposeSubtree(this.handleGroup)
          this.handleGroup = buildHandles(p)
          this.syncHandleTransform(p)
          this.scene.add(this.handleGroup)
        }
      }
      return
    }

    if (this.drag.kind === 'lift') {
      const rawDy = (this.drag.startClientY - e.clientY) * this.drag.worldPerPixel
      const dy = Math.max(snap(rawDy, doc.snapStep), -this.drag.maxDrop)
      const startPositions = this.drag.startPositions
      const ids = this.drag.ids
      store.mutate(
        (d) => {
          for (const p of d.parts) {
            const sp = startPositions.get(p.id)
            if (sp && ids.includes(p.id)) p.position = [sp[0], sp[1] + dy, sp[2]]
          }
        },
        { history: false },
      )
      const bottom = this.drag.maxDrop + dy
      bus.setDragReadout(
        bottom > 0.01 ? `${formatLength(bottom, doc.units)} above the bench` : 'on the bench',
      )
      return
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag && this.dragPointerId !== null && e.pointerId !== this.dragPointerId) return
    this.dragPointerId = null
    const store = useStore.getState()
    const drag = this.drag
    this.drag = null
    useBus.getState().setDragReadout(null)
    this.renderer.domElement.style.cursor = 'grab'
    if (!drag) return

    if (drag.kind === 'maybe-move') {
      // it was a click: select (click-through when clicking the selected front piece)
      const hits = this.hitParts(e)
      if (hits.length > 0) {
        const first = hits[0].object.userData.partId as string
        const behind = hits.find((h) => (h.object.userData.partId as string) !== first)
        if (
          !drag.shift &&
          store.selection.length === 1 &&
          store.selection[0] === first &&
          behind
        ) {
          store.select([behind.object.userData.partId as string])
        } else {
          store.select([first], drag.shift)
        }
      }
      return
    }

    if (drag.kind === 'orbit') {
      if (!drag.moved) store.clearSelection()
      return
    }

    // move / resize / lift commit one undo step
    store.endDrag()
    this.refreshSelectionVisuals()
  }

  private onWheel = (ev: WheelEvent) => {
    ev.preventDefault()
    this.rig.zoom(Math.exp(ev.deltaY * 0.0012))
  }

  private onDblClick = (e: MouseEvent) => {
    const hits = this.hitParts(e)
    if (hits.length > 0) {
      const id = hits[0].object.userData.partId as string
      useStore.getState().select([id])
      this.focusOn(id)
    }
  }

  // ------------------------------------------------------------- frame loop

  private frame = (t: number) => {
    if (this.disposed) return
    const dt = Math.min((t - this.lastTime) / 1000, 0.1)
    this.lastTime = t

    if (this.evalDirty && !this.evalQueued) {
      this.evalQueued = true
      this.evalDirty = false
      this.runEval()
      this.evalQueued = false
    }

    this.rig.update(dt)

    // constant screen-size handles
    const dist = this.rig.getDist()
    const hScale = dist * 0.02
    if (this.handleGroup) {
      for (const child of this.handleGroup.children) child.scale.setScalar(hScale)
      const part = useStore.getState().doc.parts.find((p) => p.id === this.handlePartId)
      if (part) this.syncHandleTransform(part)
    }
    const selBox = this.selectionBBox()
    if (selBox && this.liftHandle.visible) {
      this.liftHandle.position.set(
        (selBox.min.x + selBox.max.x) / 2,
        selBox.max.y + hScale * 0.4,
        (selBox.min.z + selBox.max.z) / 2,
      )
      this.liftHandle.scale.setScalar(hScale * 1.4)
      // airborne feedback: dashed drop-line
      if (selBox.min.y > 1) {
        this.dropLine.visible = true
        const x = (selBox.min.x + selBox.max.x) / 2
        const z = (selBox.min.z + selBox.max.z) / 2
        const pts = [new THREE.Vector3(x, selBox.min.y, z), new THREE.Vector3(x, 0, z)]
        this.dropLine.geometry.setFromPoints(pts)
        this.dropLine.computeLineDistances()
      } else {
        this.dropLine.visible = false
      }
    } else {
      this.dropLine.visible = false
    }

    // out-of-view watchdog
    const center = this.sceneBBox().getCenter(new THREE.Vector3()).project(this.rig.camera)
    const visible = center.z < 1 && Math.abs(center.x) < 1.3 && Math.abs(center.y) < 1.3
    if (visible) this.outOfViewSince = null
    else if (this.outOfViewSince === null) this.outOfViewSince = t

    this.updateLabelPositions()
    this.renderer.render(this.scene, this.rig.camera)
    requestAnimationFrame(this.frame)
  }

  isLost(now: number): boolean {
    return this.outOfViewSince !== null && now - this.outOfViewSince > 1500
  }
}
