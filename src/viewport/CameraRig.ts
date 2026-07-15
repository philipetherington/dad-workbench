// The clamped turntable camera.
//
// Design rules (locked by the UX spec): yaw unlimited, pitch clamped so you
// can never go under the bench or fully overhead, zero roll, no pan — the
// camera always looks at the work. Every programmatic move animates so the
// user sees where they went.

import * as THREE from 'three'
import type { ViewName } from './bus'

const DEG = Math.PI / 180

export const PITCH_MIN = 10 * DEG
export const PITCH_MAX = 88 * DEG

const VIEWS: Record<ViewName, { yaw: number; pitch: number }> = {
  corner: { yaw: -35 * DEG, pitch: 28 * DEG },
  front: { yaw: 0, pitch: 12 * DEG },
  back: { yaw: 180 * DEG, pitch: 12 * DEG },
  left: { yaw: -90 * DEG, pitch: 12 * DEG },
  right: { yaw: 90 * DEG, pitch: 12 * DEG },
  top: { yaw: 0, pitch: PITCH_MAX },
}

export class CameraRig {
  camera: THREE.PerspectiveCamera

  // current state
  private yaw = VIEWS.corner.yaw
  private pitch = VIEWS.corner.pitch
  private dist = 1600
  private target = new THREE.Vector3(0, 100, 0)

  // animation goals
  private yawT = this.yaw
  private pitchT = this.pitch
  private distT = this.dist
  private targetT = this.target.clone()

  /** Zoom limits, updated from the scene size on every fit. */
  private distMin = 250
  private distMax = 9000

  constructor(aspect: number) {
    // near=50 (5cm), NOT 1: depth precision goes as distance²/near, and with
    // near=1 in a mm-unit scene the buffer can't tell surfaces 2mm apart from
    // a few metres away — the benchtop stack z-fights into angle-dependent
    // bands. 5cm is still far closer than the zoom clamp ever allows.
    this.camera = new THREE.PerspectiveCamera(30, aspect, 50, 30000)
    this.apply(this.yaw, this.pitch, this.dist, this.target)
  }

  private apply(yaw: number, pitch: number, dist: number, target: THREE.Vector3) {
    const cp = Math.cos(pitch)
    this.camera.position.set(
      target.x + dist * Math.sin(yaw) * cp,
      target.y + dist * Math.sin(pitch),
      target.z + dist * Math.cos(yaw) * cp,
    )
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(target)
  }

  /** Advance animations; returns true while still moving (needs re-render). */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 7) // ~0.45s settle
    const before = [this.yaw, this.pitch, this.dist, this.target.x, this.target.y, this.target.z]
    this.yaw += (this.yawT - this.yaw) * k
    this.pitch += (this.pitchT - this.pitch) * k
    this.dist += (this.distT - this.dist) * k
    this.target.lerp(this.targetT, k)
    this.apply(this.yaw, this.pitch, this.dist, this.target)
    const after = [this.yaw, this.pitch, this.dist, this.target.x, this.target.y, this.target.z]
    return before.some((v, i) => Math.abs(v - after[i]) > 1e-4)
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Immediate (user-driven) orbit — drags shouldn't lag behind the hand. */
  orbitBy(dYaw: number, dPitch: number) {
    this.yaw += dYaw
    this.yawT = this.yaw
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, PITCH_MIN, PITCH_MAX)
    this.pitchT = this.pitch
    this.apply(this.yaw, this.pitch, this.dist, this.target)
  }

  goTo(view: ViewName) {
    const v = VIEWS[view]
    // take the short way around for yaw
    const twoPi = Math.PI * 2
    let dy = ((v.yaw - this.yaw) % twoPi + twoPi * 1.5) % twoPi - Math.PI
    this.yawT = this.yaw + dy
    this.pitchT = v.pitch
  }

  spin(degrees: number) {
    this.yawT += degrees * DEG
  }

  zoom(factor: number) {
    this.distT = THREE.MathUtils.clamp(this.distT * factor, this.distMin, this.distMax)
  }

  /** Frame the given world bbox (all pieces); also refreshes zoom clamps. */
  fit(bbox: THREE.Box3, animateTarget = true) {
    const size = bbox.getSize(new THREE.Vector3())
    const center = bbox.getCenter(new THREE.Vector3())
    const radius = Math.max(size.length() / 2, 120)
    // frame against the NARROWER of the vertical/horizontal view angles so a
    // wide project still fits in a narrow viewport
    const vHalf = (this.camera.fov * DEG) / 2
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect)
    const dist = (radius / Math.tan(Math.min(vHalf, hHalf))) * 1.25
    // floor of 250mm keeps the camera an order of magnitude beyond the 50mm
    // near plane — nothing in a bench-scale app needs a 4cm-away camera
    this.distMin = Math.max(radius * 0.35, 250)
    this.distMax = Math.max(dist * 4, 2500)
    this.distT = THREE.MathUtils.clamp(dist, this.distMin, this.distMax)
    this.targetT.copy(center)
    if (!animateTarget) {
      this.target.copy(center)
      this.dist = this.distT
    }
  }

  /** Glide the look-at point (double-click a piece); keeps distance sensible. */
  lookAtPoint(p: THREE.Vector3) {
    this.targetT.copy(p)
  }

  /** Keep the orbit pivot on the work without a jarring jump. */
  driftTargetToward(bbox: THREE.Box3) {
    this.targetT.copy(bbox.getCenter(new THREE.Vector3()))
  }

  get yawNow(): number {
    return this.yaw
  }

  getDist(): number {
    return this.dist
  }
}
