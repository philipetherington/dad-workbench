// Button-driven rotation (the app has no rotate gizmo).
//
// Turn/Tip/Tilt are phrased relative to where the user is standing (camera
// yaw), quantized to the nearest world axis so the buttons always do exactly
// what their pictograms promise. After every rotation the piece re-seats:
// if it was resting on the bench it stays resting on its new bottom face.

import * as THREE from 'three'
import type { Part } from './types'
import { worldSize } from './types'

export type TurnKind = 'turn' | 'tip' | 'tilt'

/** World axis for the given control, camera yaw quantized to 90°. */
export function turnAxis(kind: TurnKind, cameraYawDeg: number): THREE.Vector3 {
  if (kind === 'turn') return new THREE.Vector3(0, 1, 0)
  const q = Math.round(cameraYawDeg / 90) * 90
  const rad = (q * Math.PI) / 180
  if (kind === 'tip') {
    // camera-right axis
    return new THREE.Vector3(Math.cos(rad), 0, -Math.sin(rad))
  }
  // 'tilt': camera-forward axis (pointing away from the viewer)
  return new THREE.Vector3(-Math.sin(rad), 0, -Math.cos(rad))
}

/** Compose a world-axis rotation onto the part's current rotation. */
export function rotated(
  rotation: [number, number, number],
  axis: THREE.Vector3,
  degrees: number,
): [number, number, number] {
  const qPart = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]), 'XYZ'),
  )
  const qTurn = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), (degrees * Math.PI) / 180)
  const e = new THREE.Euler().setFromQuaternion(qTurn.multiply(qPart), 'XYZ')
  const deg = (r: number) => {
    let d = (r * 180) / Math.PI
    // snap to clean angles so repeated 90° turns never accumulate drift
    const near = Math.round(d / 0.25) * 0.25
    d = Math.abs(near - d) < 0.01 ? near : d
    return Object.is(d, -0) ? 0 : d
  }
  return [deg(e.x), deg(e.y), deg(e.z)]
}

/**
 * Apply a rotation to a part in place, re-seating it on the bench if it was
 * resting there (bottom within 1mm before the turn).
 */
export function applyRotation(part: Part, axis: THREE.Vector3, degrees: number): void {
  const before = worldSize(part)
  const wasResting = Math.abs(part.position[1] - before[1] / 2) < 1
  part.rotation = rotated(part.rotation, axis, degrees)
  const after = worldSize(part)
  if (wasResting) {
    part.position = [part.position[0], after[1] / 2, part.position[2]]
  }
}

/** Posture presets for boards: one click, always a known-good orientation. */
export const POSTURES: { key: string; label: string; rotation: [number, number, number] }[] = [
  { key: 'flat', label: 'Lying Flat', rotation: [0, 0, 0] },
  { key: 'edge', label: 'On Edge', rotation: [90, 0, 0] },
  { key: 'standing', label: 'Standing Up', rotation: [0, 0, 90] },
]

export function applyPosture(part: Part, rotation: [number, number, number]): void {
  part.rotation = [...rotation]
  const after = worldSize(part)
  part.position = [part.position[0], after[1] / 2, part.position[2]]
}

/** Mirror the part left-right (for making the matching pair of a bracket). */
export function applyFlip(part: Part): void {
  // Conjugating R = Rx·Ry·Rz by the world x-mirror gives (rx, -ry, -rz).
  // That equals a true mirror for every shape symmetric in its local x —
  // all of ours except the wedge, whose ramp runs along x; for it we also
  // spin 180° about its local y (the wedge's own left-right mirror).
  part.rotation = [part.rotation[0], -part.rotation[1], -part.rotation[2]]
  if (part.kind === 'wedge') {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        ...(part.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]),
        'XYZ',
      ),
    )
    const local180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    const e = new THREE.Euler().setFromQuaternion(q.multiply(local180), 'XYZ')
    part.rotation = [(e.x * 180) / Math.PI, (e.y * 180) / Math.PI, (e.z * 180) / Math.PI]
  }
}
