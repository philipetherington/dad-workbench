// Convert evaluated geometry into three.js BufferGeometry.
// Input is de-indexed triangle soup, so computeVertexNormals() produces
// flat per-face normals — crisp edges on boards, which is what we want.

import * as THREE from 'three'

export function positionsToGeometry(positions: Float32Array): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}
