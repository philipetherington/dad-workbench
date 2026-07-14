// Procedural canvas textures: the wooden benchtop with its etched rule,
// and the diagonal warning stripes for cutout ghosts.

import * as THREE from 'three'
import type { UnitSystem } from '../model/types'
import { IN } from '../model/units'

/** Physical size of the bench top, mm (8ft square). */
export const BENCH_SIZE = 2438.4

/**
 * Wooden benchtop with faint grid squares (1" or 50mm), heavier lines every
 * 6"/12" (or 100mm), and a rule with numbers etched along the front edge.
 */
export function benchTexture(units: UnitSystem): THREE.CanvasTexture {
  const px = 2048
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')!
  const scale = px / BENCH_SIZE // px per mm

  // planks
  ctx.fillStyle = '#cdb289'
  ctx.fillRect(0, 0, px, px)
  const plank = 140 * scale
  for (let i = 0; i < px / plank; i++) {
    const shade = 0.94 + 0.09 * ((i * 2654435761) % 7) / 7
    ctx.fillStyle = `rgb(${Math.round(205 * shade)}, ${Math.round(178 * shade)}, ${Math.round(137 * shade)})`
    ctx.fillRect(i * plank, 0, plank + 1, px)
    // subtle grain
    ctx.strokeStyle = 'rgba(120, 90, 55, 0.10)'
    ctx.lineWidth = 1
    for (let g = 0; g < 4; g++) {
      const gx = i * plank + ((g + 1) * plank) / 5 + (((i * 7 + g * 13) % 9) - 4) * scale * 4
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      ctx.bezierCurveTo(gx + 8, px * 0.3, gx - 8, px * 0.7, gx, px)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(90, 65, 40, 0.28)'
    ctx.beginPath()
    ctx.moveTo(i * plank, 0)
    ctx.lineTo(i * plank, px)
    ctx.stroke()
  }

  // grid
  const minor = units === 'in' ? IN : 50
  const major = units === 'in' ? 6 * IN : 100
  const strong = units === 'in' ? 12 * IN : 500
  const half = px / 2
  const drawGrid = (step: number, style: string, width: number) => {
    ctx.strokeStyle = style
    ctx.lineWidth = width
    for (let d = 0; d <= BENCH_SIZE / 2; d += step) {
      for (const s of d === 0 ? [0] : [-1, 1]) {
        const v = half + s * d * scale
        ctx.beginPath()
        ctx.moveTo(v, 0)
        ctx.lineTo(v, px)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, v)
        ctx.lineTo(px, v)
        ctx.stroke()
      }
    }
  }
  drawGrid(minor, 'rgba(90, 65, 40, 0.12)', 1)
  drawGrid(major, 'rgba(90, 65, 40, 0.22)', 1.5)
  drawGrid(strong, 'rgba(90, 65, 40, 0.34)', 2.5)

  // etched rule along the front edge (+z side = bottom of canvas) and left edge
  ctx.fillStyle = 'rgba(60, 42, 25, 0.75)'
  ctx.strokeStyle = 'rgba(60, 42, 25, 0.75)'
  ctx.font = `${Math.round(26)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  const label = (dMm: number) =>
    units === 'in' ? `${Math.round(dMm / IN)}` : `${Math.round(dMm / 10)}`
  for (let d = major; d <= BENCH_SIZE / 2 - major / 2; d += major) {
    for (const s of [-1, 1]) {
      const v = half + s * d * scale
      // front edge ticks + numbers
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(v, px - 26)
      ctx.lineTo(v, px - 6)
      ctx.stroke()
      ctx.fillText(label(d), v, px - 34)
      // left edge ticks
      ctx.beginPath()
      ctx.moveTo(6, v)
      ctx.lineTo(26, v)
      ctx.stroke()
    }
  }
  ctx.fillText('0', half, px - 34)

  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Diagonal red stripes for cutout ghosts (stripes carry meaning, not just hue). */
export function stripeTexture(): THREE.CanvasTexture {
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(235, 120, 120, 0.55)'
  ctx.fillRect(0, 0, s, s)
  ctx.strokeStyle = 'rgba(190, 40, 40, 0.85)'
  ctx.lineWidth = 13
  for (let i = -s; i < s * 2; i += 32) {
    ctx.beginPath()
    ctx.moveTo(i, -8)
    ctx.lineTo(i + s, s + 8)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
