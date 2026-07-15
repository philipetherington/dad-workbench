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

  // A calm, near-uniform wood surface. High-contrast per-plank shading and
  // grain lines are exactly the kind of high-frequency detail that aliases
  // into wonky staggered bands and moiré when this big plane is minified and
  // seen at an angle. Keep only very faint, widely-spaced plank seams so the
  // bench still reads as wood without giving the texture filter anything to
  // fight.
  ctx.fillStyle = '#cdb289'
  ctx.fillRect(0, 0, px, px)
  const plank = 300 * scale // wide boards → few, low-frequency seams
  ctx.strokeStyle = 'rgba(90, 65, 40, 0.10)'
  ctx.lineWidth = 1.5
  for (let i = 1; i < px / plank; i++) {
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

  // Dissolve the fine grid and plank seams into flat wood toward the edges.
  // Those are the only high-frequency marks on the bench; out near the rim,
  // seen at a grazing angle, they alias into a moiré staircase no amount of
  // mipmapping fully removes. The grid is a measuring aid for the work, which
  // lives near the middle — so keep it crisp there and let it fade away.
  // Reach FULLY flat wood before the texture's edges (corners sit at r≈0.707).
  // Any residual grid left in the corners still aliases into a faint staircase
  // at extreme grazing, so the outer half must be pure wood — zero grid there.
  const fade = ctx.createRadialGradient(half, half, px * 0.16, half, half, px * 0.5)
  fade.addColorStop(0, 'rgba(205, 178, 137, 0)')
  fade.addColorStop(1, 'rgba(205, 178, 137, 1)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, px, px)

  // etched rule along the front edge (+z side = bottom of canvas) and left edge
  // — drawn AFTER the fade so the measuring numbers stay crisp at the rim
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
  // The benchtop is a big plane seen at grazing angles; without mipmaps + high
  // anisotropy the etched grid lines shimmer into moiré. three.js clamps the
  // anisotropy request to the GPU's real maximum.
  tex.anisotropy = 16
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Benchtop material: a solid wood surface with the measuring grid drawn
 * ANALYTICALLY in the fragment shader (not sampled from a texture). Each grid
 * line's width is derived from the on-screen pixel derivative (fwidth), so it
 * stays one crisp line at every distance and every viewing angle and can never
 * moiré or alias into bands — the failure mode of any raster grid on a big
 * ground plane. The grid fades out with distance from the bench centre so the
 * far reaches read as calm, empty wood.
 */
export function benchMaterial(units: UnitSystem): THREE.MeshStandardMaterial {
  const minor = units === 'in' ? IN : 50 // 1" or 50mm
  const major = units === 'in' ? 12 * IN : 250 // 1' or 250mm

  const mat = new THREE.MeshStandardMaterial({ color: '#cbb083', roughness: 0.96, metalness: 0 })

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMinor = { value: minor }
    shader.uniforms.uMajor = { value: major }
    shader.uniforms.uFadeStart = { value: BENCH_SIZE * 0.16 }
    shader.uniforms.uFadeEnd = { value: BENCH_SIZE * 0.52 }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBenchWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vBenchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBenchWorld;
        uniform float uMinor;
        uniform float uMajor;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        // 1.0 on a grid line, 0.0 between — width follows the pixel footprint
        float benchGrid(vec2 p, float spacing, float widthPx) {
          vec2 c = p / spacing;
          vec2 d = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          float line = min(d.x, d.y);
          return 1.0 - clamp(line - widthPx * 0.5, 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 gp = vBenchWorld.xz;
          float minorL = benchGrid(gp, uMinor, 1.0);
          float majorL = benchGrid(gp, uMajor, 1.4);
          float r = length(gp);
          float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, r);
          vec3 lineCol = vec3(0.30, 0.23, 0.15);
          float amt = max(minorL * 0.16, majorL * 0.34) * fade;
          diffuseColor.rgb = mix(diffuseColor.rgb, lineCol, amt);
        }`,
      )
  }
  // distinct cache key so this program isn't shared with plain standard mats
  mat.customProgramCacheKey = () => `bench-grid-${units}`
  return mat
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
