// Position math for the inspector: camera-relative nudge deltas and the
// clearance between two pieces.

export interface BBox {
  min: [number, number, number]
  max: [number, number, number]
}

/**
 * Rotate a screen-relative horizontal nudge (dx = screen-right, dz = toward
 * the viewer) into world x/z, camera yaw quantized to the nearest 90° — the
 * same convention as turnAxis in rotate.ts, so 'Left' always moves the piece
 * left on screen. At yaw 0 this is the identity.
 */
export function nudgeDelta(dx: number, dz: number, cameraYawDeg: number): [number, number] {
  const q = Math.round(cameraYawDeg / 90) * 90
  const rad = (q * Math.PI) / 180
  // quantized yaw makes cos/sin exact ±1/0 up to float noise
  const cos = Math.round(Math.cos(rad))
  const sin = Math.round(Math.sin(rad))
  return [dx * cos + dz * sin, -dx * sin + dz * cos]
}

/** Per-axis clearance between two boxes: positive = air, negative = overlap. */
export function gapPerAxis(a: BBox, b: BBox): [number, number, number] {
  const gap = (i: number) => Math.max(b.min[i] - a.max[i], a.min[i] - b.max[i])
  return [gap(0), gap(1), gap(2)]
}
