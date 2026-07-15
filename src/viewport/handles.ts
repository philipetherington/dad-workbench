// Resize and lift handles.
//
// Spec: exactly one flat square handle per face; each handle changes exactly
// one dimension, growing from the anchored opposite face (radial dims like a
// dowel's diameter grow from the center instead). Vertical movement is
// quarantined to the single lift arrow above the selection.

import * as THREE from 'three'
import type { Part } from '../model/types'
import { DIM_SPECS, localSize } from '../model/types'

export interface HandleSpec {
  dimKey: string
  /** Which face along the local axis (+1/-1). Radial handles use +1. */
  sign: 1 | -1
  /** Local axis the drag moves along (0=x, 1=y, 2=z). */
  axis: 0 | 1 | 2
  /** Radial dims (diameters) grow from the center: delta counts double, position stays. */
  radial: boolean
  localPos: [number, number, number]
}

export function handleSpecs(part: Part): HandleSpec[] {
  const d = part.dims
  const specs: HandleSpec[] = []
  switch (part.kind) {
    case 'board':
      for (const [key, axis, size] of [
        ['length', 0, d.length],
        ['thickness', 1, d.thickness],
        ['width', 2, d.width],
      ] as const) {
        for (const sign of [1, -1] as const) {
          const pos: [number, number, number] = [0, 0, 0]
          pos[axis] = (sign * size) / 2
          specs.push({ dimKey: key, sign, axis, radial: false, localPos: pos })
        }
      }
      break
    case 'wedge':
      for (const [key, axis, size] of [
        ['length', 0, d.length],
        ['height', 1, d.height],
        ['width', 2, d.width],
      ] as const) {
        for (const sign of [1, -1] as const) {
          const pos: [number, number, number] = [0, 0, 0]
          pos[axis] = (sign * size) / 2
          specs.push({ dimKey: key, sign, axis, radial: false, localPos: pos })
        }
      }
      break
    case 'slot':
      for (const [key, axis, size] of [
        ['length', 0, d.length],
        ['deep', 1, d.deep],
        ['width', 2, Math.min(d.width, d.length)],
      ] as const) {
        for (const sign of [1, -1] as const) {
          const pos: [number, number, number] = [0, 0, 0]
          pos[axis] = (sign * size) / 2
          specs.push({ dimKey: key, sign, axis, radial: false, localPos: pos })
        }
      }
      break
    case 'cylinder':
      for (const sign of [1, -1] as const)
        specs.push({ dimKey: 'height', sign, axis: 1, radial: false, localPos: [0, (sign * d.height) / 2, 0] })
      specs.push({ dimKey: 'diameter', sign: 1, axis: 0, radial: true, localPos: [d.diameter / 2, 0, 0] })
      break
    case 'sphere':
      specs.push({ dimKey: 'diameter', sign: 1, axis: 0, radial: true, localPos: [d.diameter / 2, 0, 0] })
      break
    case 'cone':
      for (const sign of [1, -1] as const)
        specs.push({ dimKey: 'height', sign, axis: 1, radial: false, localPos: [0, (sign * d.height) / 2, 0] })
      specs.push({ dimKey: 'diameter', sign: 1, axis: 0, radial: true, localPos: [d.diameter / 2, -d.height / 2, 0] })
      specs.push({ dimKey: 'topDiameter', sign: 1, axis: 0, radial: true, localPos: [Math.max(d.topDiameter / 2, 6), d.height / 2, 0] })
      break
    case 'dado':
    case 'groove':
    case 'rabbet':
    case 'tenon':
    case 'edge-profile': {
      // joinery cutters: standard two-handles-per-axis-dim on the local bbox
      // faces (localSize gives the unhosted fallback box). Integer dims — the
      // edge-profile's 'profile' chip — get no handle.
      const size = localSize(part)
      for (const spec of DIM_SPECS[part.kind]) {
        if (spec.axis === undefined || spec.integer) continue
        for (const sign of [1, -1] as const) {
          const pos: [number, number, number] = [0, 0, 0]
          pos[spec.axis] = (sign * size[spec.axis]) / 2
          specs.push({ dimKey: spec.key, sign, axis: spec.axis, radial: false, localPos: pos })
        }
      }
      break
    }
  }
  // sanity: only dims that exist in the spec table
  const valid = new Set(DIM_SPECS[part.kind].map((s) => s.key))
  return specs.filter((s) => valid.has(s.dimKey))
}

let squareTex: THREE.CanvasTexture | null = null

function handleTexture(): THREE.CanvasTexture {
  if (squareTex) return squareTex
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')!
  const r = 22
  ctx.fillStyle = '#ff8a3d'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.roundRect(8, 8, s - 16, s - 16, r)
  ctx.fill()
  ctx.stroke()
  squareTex = new THREE.CanvasTexture(canvas)
  squareTex.colorSpace = THREE.SRGBColorSpace
  return squareTex
}

export const HANDLE_BASE_SIZE = 1 // world units at scale 1; Viewport rescales per frame

/**
 * Build the handle group for a part in its LOCAL frame. The caller positions
 * and rotates the group with the part, and rescales each handle every frame
 * for constant on-screen size (via userData.baseScale).
 */
export function buildHandles(part: Part): THREE.Group {
  const group = new THREE.Group()
  const tex = handleTexture()
  for (const spec of handleSpecs(part)) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(HANDLE_BASE_SIZE, HANDLE_BASE_SIZE), mat)
    mesh.position.set(...spec.localPos)
    // lie flat on the face it controls
    const normal = new THREE.Vector3()
    normal.setComponent(spec.axis, spec.sign)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    mesh.renderOrder = 999
    mesh.userData = { handle: spec, partId: part.id }
    group.add(mesh)
  }
  return group
}

/** World-space lift arrow shown above the selection's bbox top center. */
export function buildLiftHandle(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: '#ff8a3d', depthTest: false, transparent: true })
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 12), mat)
  stem.position.y = 0.28
  const tipUp = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 16), mat)
  tipUp.position.y = 0.72
  const tipDown = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 16), mat)
  tipDown.position.y = -0.12
  tipDown.rotation.x = Math.PI
  for (const m of [stem, tipUp, tipDown]) {
    m.renderOrder = 999
    m.userData = { lift: true }
    group.add(m)
  }
  return group
}
