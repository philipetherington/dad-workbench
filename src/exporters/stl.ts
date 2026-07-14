// Binary STL exporter. Input is a de-indexed triangle soup in mm, Z-up,
// 9 floats per triangle (already converted from the y-up world by the engine).

const HEADER_TEXT = 'Workbench STL export'

export function exportSTL(positions: Float32Array): ArrayBuffer {
  const triCount = Math.floor(positions.length / 9)
  const buffer = new ArrayBuffer(84 + 50 * triCount)
  const view = new DataView(buffer)

  for (let i = 0; i < HEADER_TEXT.length; i++) {
    view.setUint8(i, HEADER_TEXT.charCodeAt(i))
  }
  view.setUint32(80, triCount, true)

  let off = 84
  for (let t = 0; t < triCount; t++) {
    const p = t * 9
    const ax = positions[p], ay = positions[p + 1], az = positions[p + 2]
    const bx = positions[p + 3], by = positions[p + 4], bz = positions[p + 5]
    const cx = positions[p + 6], cy = positions[p + 7], cz = positions[p + 8]

    // normal = normalize(cross(B-A, C-A)); (0,0,0) when degenerate
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len > 0) {
      nx /= len
      ny /= len
      nz /= len
    } else {
      nx = ny = nz = 0
    }

    view.setFloat32(off, nx, true)
    view.setFloat32(off + 4, ny, true)
    view.setFloat32(off + 8, nz, true)
    for (let k = 0; k < 9; k++) {
      view.setFloat32(off + 12 + k * 4, positions[p + k], true)
    }
    view.setUint16(off + 48, 0, true)
    off += 50
  }

  return buffer
}
