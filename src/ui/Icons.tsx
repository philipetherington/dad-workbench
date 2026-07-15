// Hand-drawn inline SVG icons for Workbench.
//
// Two families:
//   - ShapeIcon: little isometric pictures of the toolbar shapes. Solids are
//     warm wood (#c9a06a) with darker side-shading (#a9793f); holes are the
//     silhouette filled with the app's diagonal red stripe pattern.
//   - Everything else: plain stroke pictograms in currentColor so they inherit
//     button text color. Bold lines, round caps, readable at a glance.
//
// No icon libraries, no stylesheets — everything is drawn right here.

import React from 'react'

// ---------- shared palette ----------

const WOOD = '#c9a06a'
const WOOD_DARK = '#a9793f'
const WOOD_EDGE = '#6b5d4a'
const HOLE_EDGE = '#c0392b'
const STRIPE_LIGHT = '#f3b9b9'
const STRIPE_DARK = '#e07f7f'
const METAL = '#9ba3ad'
const METAL_DARK = '#8d949c'
const METAL_LIGHT = '#c7cdd4'
const METAL_EDGE = '#4d565f'

const solidProps = {
  stroke: WOOD_EDGE,
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

const holeProps = {
  stroke: HOLE_EDGE,
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

const metalProps = {
  stroke: METAL_EDGE,
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

// Ids whose picture uses the diagonal red stripe pattern (things that CUT).
const STRIPED_IDS = new Set([
  'round-hole',
  'square-hole',
  'slot',
  'dado',
  'groove',
  'rabbet',
  'tenon',
  'edge-profile',
])

// ---------- ShapeIcon ----------

export function ShapeIcon({ id, size = 44 }: { id: string; size?: number }): React.ReactElement {
  // Unique per-instance pattern id so several hole icons on one page
  // never fight over the same <pattern>.
  const uid = React.useId()
  const patternId = `wb-stripe-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const stripes = `url(#${patternId})`
  const isHole = STRIPED_IDS.has(id)

  let picture: React.ReactElement

  switch (id) {
    case 'board':
      // Long flat plank seen from a corner: big top face, thin front edge.
      picture = (
        <g {...solidProps}>
          <polygon points="4,26 32,15 44,20 16,31" fill={WOOD} />
          <polygon points="16,31 44,20 44,26 16,37" fill={WOOD_DARK} />
          <polygon points="4,26 16,31 16,37 4,32" fill={WOOD_DARK} />
        </g>
      )
      break

    case 'dowel':
      // Cylinder lying on its side; the near end cap is the darker disc.
      picture = (
        <g {...solidProps}>
          <path d="M 10 15 H 38 A 6 9 0 0 1 38 33 H 10 A 6 9 0 0 1 10 15 Z" fill={WOOD} />
          <ellipse cx="38" cy="24" rx="6" ry="9" fill={WOOD_DARK} />
        </g>
      )
      break

    case 'block':
      // Classic cube: light top, wood left face, darker right face.
      picture = (
        <g {...solidProps}>
          <polygon points="24,7 41,15 24,23 7,15" fill="#dcb87f" />
          <polygon points="7,15 24,23 24,41 7,33" fill={WOOD} />
          <polygon points="24,23 41,15 41,33 24,41" fill={WOOD_DARK} />
        </g>
      )
      break

    case 'ball':
      // Sphere: wood circle, dark crescent below, small highlight up-left.
      picture = (
        <g {...solidProps}>
          <circle cx="24" cy="24" r="17" fill={WOOD} />
          <path
            d="M 9.5 31 A 17 17 0 0 0 38.5 31 A 22 13 0 0 1 9.5 31 Z"
            fill={WOOD_DARK}
            stroke="none"
          />
          <ellipse cx="17" cy="16" rx="5" ry="3.4" fill="#efd9b4" stroke="none" transform="rotate(-30 17 16)" />
        </g>
      )
      break

    case 'wedge':
      // Doorstop ramp: slanted top face, darker upright side.
      picture = (
        <g {...solidProps}>
          <polygon points="5,39 37,13 43,17 11,43" fill={WOOD} />
          <polygon points="37,13 43,17 43,43 37,39" fill={WOOD_DARK} />
          <polygon points="5,39 11,43 43,43 37,39" fill={WOOD_DARK} />
        </g>
      )
      break

    case 'cone':
      // Cone standing up: triangle body over an elliptical base.
      picture = (
        <g {...solidProps}>
          <path d="M 24 6 L 9.5 36 A 14.5 6.5 0 0 0 38.5 36 Z" fill={WOOD} />
          <path
            d="M 24 6 L 38.5 36 A 14.5 6.5 0 0 1 29 42.1 Z"
            fill={WOOD_DARK}
            stroke="none"
          />
          <path d="M 24 6 L 9.5 36 A 14.5 6.5 0 0 0 38.5 36 Z" fill="none" />
        </g>
      )
      break

    case 'round-hole':
      // Round hole seen at a slight angle: striped ellipse opening + depth wall.
      picture = (
        <g {...holeProps}>
          <path d="M 9 19 V 29 A 15 8 0 0 0 39 29 V 19" fill={STRIPE_DARK} />
          <ellipse cx="24" cy="19" rx="15" ry="8" fill={stripes} />
        </g>
      )
      break

    case 'square-hole':
      // Square pocket: striped opening in slight perspective + depth wall.
      picture = (
        <g {...holeProps}>
          <path d="M 6 22 V 33 H 42 V 22" fill={STRIPE_DARK} />
          <polygon points="10,12 38,12 42,22 6,22" fill={stripes} />
        </g>
      )
      break

    case 'slot':
      // Rounded slot: striped stadium opening + depth wall.
      picture = (
        <g {...holeProps}>
          <path d="M 5 22 V 27 A 7 7 0 0 0 12 34 H 36 A 7 7 0 0 0 43 27 V 22" fill={STRIPE_DARK} />
          <rect x="5" y="14" width="38" height="14" rx="7" fill={stripes} />
        </g>
      )
      break

    // ----- joinery cutters (red-striped: they remove wood) -----

    case 'dado':
      // Board cross-section with a square channel cut across the top.
      picture = (
        <g>
          <path
            d="M 4 16 H 17 V 26 H 31 V 16 H 44 V 36 H 4 Z"
            fill={WOOD}
            {...solidProps}
          />
          <rect x="17" y="16" width="14" height="10" fill={stripes} {...holeProps} />
        </g>
      )
      break

    case 'groove':
      // Plank seen from a corner with a striped channel running lengthwise.
      picture = (
        <g>
          <polygon points="4,26 32,15 44,20 16,31" fill={WOOD} {...solidProps} />
          <polygon points="16,31 44,20 44,26 16,37" fill={WOOD_DARK} {...solidProps} />
          <polygon points="4,26 16,31 16,37 4,32" fill={WOOD_DARK} {...solidProps} />
          <polygon points="8.2,27.7 36.2,16.7 40.4,18.5 12.4,29.5" fill={stripes} {...holeProps} />
        </g>
      )
      break

    case 'rabbet':
      // Board cross-section with a step removed from its top edge.
      picture = (
        <g>
          <path d="M 6 14 H 29 V 23 H 42 V 36 H 6 Z" fill={WOOD} {...solidProps} />
          <rect x="29" y="14" width="13" height="9" fill={stripes} {...holeProps} />
        </g>
      )
      break

    case 'tenon':
      // Board end, side view: wood tongue protrudes, removed shoulders striped.
      picture = (
        <g>
          <rect x="4" y="12" width="24" height="24" fill={WOOD} {...solidProps} />
          <rect x="28" y="19" width="15" height="10" fill={WOOD} {...solidProps} />
          <rect x="28" y="12" width="15" height="7" fill={stripes} {...holeProps} />
          <rect x="28" y="29" width="15" height="7" fill={stripes} {...holeProps} />
        </g>
      )
      break

    case 'edge-profile':
      // Board corner with a quarter round cut away (striped quarter-circle).
      picture = (
        <g>
          <path d="M 8 14 H 29 A 11 11 0 0 0 40 25 V 38 H 8 Z" fill={WOOD} {...solidProps} />
          <path d="M 29 14 H 40 V 25 A 11 11 0 0 1 29 14 Z" fill={stripes} {...holeProps} />
        </g>
      )
      break

    // ----- hardware (metal grays, never striped) -----

    case 'shelf-pin-row':
      // Cabinet side with a vertical row of four pin holes.
      picture = (
        <g>
          <rect x="15" y="5" width="18" height="38" fill={WOOD} {...solidProps} />
          <g {...metalProps}>
            <circle cx="24" cy="11.5" r="3" fill={METAL_DARK} />
            <circle cx="24" cy="19.8" r="3" fill={METAL_DARK} />
            <circle cx="24" cy="28.1" r="3" fill={METAL_DARK} />
            <circle cx="24" cy="36.4" r="3" fill={METAL_DARK} />
          </g>
        </g>
      )
      break

    case 'cup-hinge':
      // Euro hinge: big cup bore on the left, mounting plate wing with screws.
      picture = (
        <g {...metalProps}>
          <rect x="24" y="17" width="20" height="14" rx="3" fill={METAL} />
          <circle cx="17" cy="24" r="12" fill={METAL} />
          <circle cx="17" cy="24" r="7.5" fill={METAL_DARK} />
          <circle cx="31.5" cy="24" r="2.2" fill={METAL_DARK} />
          <circle cx="39" cy="24" r="2.2" fill={METAL_DARK} />
        </g>
      )
      break

    case 'wood-screw':
      // Side view: countersunk slotted head, tapered threaded shank.
      picture = (
        <g {...metalProps}>
          <path d="M 13 6 H 35 L 29.5 14 H 18.5 Z" fill={METAL} />
          <path d="M 24 6 V 10.5" strokeWidth={2.4} />
          <path d="M 18.5 14 L 24 43 L 29.5 14 Z" fill={METAL_DARK} />
          <path d="M 19.5 19.5 L 28 17" strokeWidth={1.6} />
          <path d="M 20.6 25.5 L 27.2 23" strokeWidth={1.6} />
          <path d="M 21.7 31.5 L 26.4 29" strokeWidth={1.6} />
          <path d="M 22.7 37 L 25.5 35" strokeWidth={1.6} />
        </g>
      )
      break

    case 'butt-hinge':
      // Two leaves with screw holes flanking a knuckled barrel.
      picture = (
        <g {...metalProps}>
          <rect x="5" y="12" width="15" height="24" fill={METAL} />
          <rect x="28" y="12" width="15" height="24" fill={METAL} />
          <rect x="20" y="9" width="8" height="30" rx="4" fill={METAL_DARK} />
          <path d="M 20 19 H 28 M 20 29 H 28" strokeWidth={1.6} />
          <circle cx="12.5" cy="18" r="2" fill={METAL_DARK} />
          <circle cx="12.5" cy="30" r="2" fill={METAL_DARK} />
          <circle cx="35.5" cy="18" r="2" fill={METAL_DARK} />
          <circle cx="35.5" cy="30" r="2" fill={METAL_DARK} />
        </g>
      )
      break

    case 'drawer-slide':
      // Long thin rail with a row of ball bearings showing in the channel.
      picture = (
        <g {...metalProps}>
          <rect x="3" y="18" width="42" height="12" rx="2.5" fill={METAL} />
          <rect x="6" y="21.5" width="36" height="5" rx="2.5" fill={METAL_DARK} stroke="none" />
          <g fill={METAL_LIGHT} stroke="none">
            <circle cx="11" cy="24" r="2" />
            <circle cx="17.5" cy="24" r="2" />
            <circle cx="24" cy="24" r="2" />
            <circle cx="30.5" cy="24" r="2" />
            <circle cx="37" cy="24" r="2" />
          </g>
        </g>
      )
      break

    case 'pocket-screw':
      // Board section with the characteristic angled pocket and screw.
      picture = (
        <g>
          <rect x="4" y="20" width="40" height="20" fill={WOOD} {...solidProps} />
          <path d="M 12 20 H 25 L 38 33 L 31 39 Z" fill={WOOD_DARK} {...solidProps} />
          <g {...metalProps}>
            <path d="M 15 15 L 33 32" stroke={METAL} strokeWidth={5} />
            <path d="M 33 32 L 36.5 35.3" stroke={METAL_DARK} strokeWidth={3} />
            <circle cx="14" cy="14" r="3.6" fill={METAL_DARK} />
          </g>
        </g>
      )
      break

    case 'dowel-pin':
      // Short fluted dowel lying on its side.
      picture = (
        <g {...metalProps}>
          <path d="M 13 16 H 34 A 5 8 0 0 1 34 32 H 13 A 5 8 0 0 1 13 16 Z" fill={METAL} />
          <ellipse cx="34" cy="24" rx="5" ry="8" fill={METAL_DARK} />
          <path d="M 15 20 H 31.5 M 15 24 H 31 M 15 28 H 31.5" strokeWidth={1.6} />
        </g>
      )
      break

    case 'knob':
      // Round knob on a base plate, front view.
      picture = (
        <g {...metalProps}>
          <circle cx="24" cy="24" r="16" fill={METAL_DARK} />
          <circle cx="24" cy="24" r="9.5" fill={METAL} />
          <ellipse
            cx="20"
            cy="20"
            rx="3.4"
            ry="2.2"
            fill={METAL_LIGHT}
            stroke="none"
            transform="rotate(-35 20 20)"
          />
        </g>
      )
      break

    case 'pull':
      // Bar pull: horizontal bar standing on two posts, front view.
      picture = (
        <g {...metalProps}>
          <rect x="11" y="22" width="5" height="13" fill={METAL_DARK} />
          <rect x="32" y="22" width="5" height="13" fill={METAL_DARK} />
          <rect x="5" y="13" width="38" height="9" rx="4.5" fill={METAL} />
        </g>
      )
      break

    // ----- builders (wood, slightly diagrammatic) -----

    case 'drawer':
      // Open drawer box seen at an angle: front, side, dark open top.
      picture = (
        <g {...solidProps}>
          <polygon points="6,20 18,13 42,13 30,20" fill="#7d6146" />
          <polygon points="30,20 42,13 42,32 30,39" fill={WOOD_DARK} />
          <rect x="6" y="20" width="24" height="19" fill={WOOD} />
          <circle cx="18" cy="29.5" r="2.4" fill={WOOD_DARK} />
        </g>
      )
      break

    case 'door':
      // Rail-and-stile frame around a recessed panel.
      picture = (
        <g {...solidProps}>
          <rect x="10" y="5" width="28" height="38" fill={WOOD} />
          <rect x="16.5" y="11.5" width="15" height="25" fill="#dcb87f" />
        </g>
      )
      break

    default:
      // Unknown id: a small neutral wood square so the UI never shows a gap.
      picture = (
        <g {...solidProps}>
          <rect x="12" y="12" width="24" height="24" rx="4" fill={WOOD} />
        </g>
      )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {isHole && (
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="14"
            height="14"
            patternTransform="rotate(45)"
          >
            <rect width="14" height="14" fill={STRIPE_LIGHT} />
            <rect width="6" height="14" fill={STRIPE_DARK} />
          </pattern>
        </defs>
      )}
      {picture}
    </svg>
  )
}

// ---------- stroke icon plumbing ----------

function StrokeSvg({
  size,
  children,
}: {
  size: number
  children: React.ReactNode
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Mirror the drawing horizontally within the 24x24 box. */
const MIRROR_X = 'scale(-1 1) translate(-24 0)'

// ---------- ArrowIcon ----------

export function ArrowIcon({
  dir,
  size = 20,
}: {
  dir: 'left' | 'right' | 'up' | 'down' | 'forward' | 'back'
  size?: number
}): React.ReactElement {
  let d: string
  switch (dir) {
    case 'left':
      d = 'M 20 12 H 4.5 M 10.5 5.5 L 4 12 L 10.5 18.5'
      break
    case 'right':
      d = 'M 4 12 H 19.5 M 13.5 5.5 L 20 12 L 13.5 18.5'
      break
    case 'up':
      d = 'M 12 20 V 4.5 M 5.5 10.5 L 12 4 L 18.5 10.5'
      break
    case 'down':
      d = 'M 12 4 V 19.5 M 5.5 13.5 L 12 20 L 18.5 13.5'
      break
    case 'forward':
      // Toward the viewer: down-left diagonal.
      d = 'M 18.5 5.5 L 6 18 M 6 9.5 V 18 H 14.5'
      break
    case 'back':
      // Away from the viewer: up-right diagonal.
      d = 'M 5.5 18.5 L 18 6 M 18 14.5 V 6 H 9.5'
      break
  }
  return (
    <StrokeSvg size={size}>
      <path d={d} />
    </StrokeSvg>
  )
}

// ---------- SpinIcon ----------

export function SpinIcon({
  dir,
  size = 20,
}: {
  dir: 'ccw' | 'cw'
  size?: number
}): React.ReactElement {
  // Drawn clockwise; ccw is the mirror image.
  return (
    <StrokeSvg size={size}>
      <g transform={dir === 'ccw' ? MIRROR_X : undefined}>
        <path d="M 20 12 A 8 8 0 1 1 16.6 5.5" />
        <path d="M 16.2 1.8 L 16.7 5.6 L 20.4 4.6" />
      </g>
    </StrokeSvg>
  )
}

// ---------- TipIcon ----------

export function TipIcon({
  dir,
  size = 22,
}: {
  dir: 'forward' | 'back'
  size?: number
}): React.ReactElement {
  // A little board mid-tip over an arc arrow. Drawn tipping forward
  // (falling to the left); 'back' mirrors it.
  return (
    <StrokeSvg size={size}>
      <g transform={dir === 'back' ? MIRROR_X : undefined}>
        {/* board, leaning */}
        <rect x="10.5" y="8" width="4.5" height="13" rx="1" transform="rotate(-32 12.75 21)" />
        {/* ground */}
        <path d="M 3 21.5 H 21" strokeWidth={1.7} />
        {/* arc arrow showing the tipping motion */}
        <path d="M 17.5 4.5 A 11 11 0 0 0 5.5 8.5" strokeWidth={1.9} />
        <path d="M 4.6 4.9 L 5.4 8.7 L 9.1 7.5" strokeWidth={1.9} />
      </g>
    </StrokeSvg>
  )
}

// ---------- TiltIcon ----------

export function TiltIcon({
  dir,
  size = 22,
}: {
  dir: 'left' | 'right'
  size?: number
}): React.ReactElement {
  // A little board tilting sideways with an arc arrow. Drawn tilting left;
  // 'right' mirrors it.
  return (
    <StrokeSvg size={size}>
      <g transform={dir === 'right' ? MIRROR_X : undefined}>
        {/* board, leaning left from its base */}
        <rect x="9" y="9" width="12" height="4.5" rx="1" transform="rotate(-22 15 13.5)" />
        {/* ground */}
        <path d="M 3 21.5 H 21" strokeWidth={1.7} />
        {/* arc arrow */}
        <path d="M 18 4 A 12 12 0 0 0 6.5 6.8" strokeWidth={1.9} />
        <path d="M 5.9 3 L 6.4 6.9 L 10.2 6" strokeWidth={1.9} />
      </g>
    </StrokeSvg>
  )
}

// ---------- PostureIcon ----------

export function PostureIcon({
  posture,
  size = 30,
}: {
  posture: 'flat' | 'edge' | 'standing'
  size?: number
}): React.ReactElement {
  // The same plank three ways: lying flat (long + thin), on its long edge
  // (long + taller), standing on end (tall + narrow). Ground line under each.
  let plank: React.ReactElement
  switch (posture) {
    case 'flat':
      plank = <rect x="3" y="15.5" width="18" height="4" rx="1" />
      break
    case 'edge':
      plank = <rect x="3" y="9.5" width="18" height="10" rx="1" />
      break
    case 'standing':
      plank = <rect x="9" y="1.5" width="6" height="18" rx="1" />
      break
  }
  return (
    <StrokeSvg size={size}>
      {plank}
      <path d="M 2 22.5 H 22" strokeWidth={1.7} />
    </StrokeSvg>
  )
}

// ---------- FlipIcon ----------

export function FlipIcon({ size = 20 }: { size?: number }): React.ReactElement {
  // A mirrored pair: the same wedge shape on each side of a dashed mirror
  // line. The left one is filled as the "original", the right is its mirror.
  return (
    <StrokeSvg size={size}>
      <path d="M 12 2.5 V 21.5" strokeDasharray="2.6 2.6" strokeWidth={1.7} />
      <path d="M 8.5 5.5 V 18.5 H 2.5 Z" fill="currentColor" fillOpacity={0.3} />
      <path d="M 15.5 5.5 V 18.5 H 21.5 Z" />
    </StrokeSvg>
  )
}

// ---------- Undo / Redo ----------

export function UndoIcon({ size = 20 }: { size?: number }): React.ReactElement {
  return (
    <StrokeSvg size={size}>
      <path d="M 9 4 L 3.5 9 L 9 14" />
      <path d="M 3.5 9 H 14.5 A 6 6 0 0 1 14.5 21 H 9.5" />
    </StrokeSvg>
  )
}

export function RedoIcon({ size = 20 }: { size?: number }): React.ReactElement {
  return (
    <StrokeSvg size={size}>
      <g transform={MIRROR_X}>
        <path d="M 9 4 L 3.5 9 L 9 14" />
        <path d="M 3.5 9 H 14.5 A 6 6 0 0 1 14.5 21 H 9.5" />
      </g>
    </StrokeSvg>
  )
}

// ---------- EyeIcon ----------

export function EyeIcon({ open, size = 20 }: { open: boolean; size?: number }): React.ReactElement {
  if (open) {
    return (
      <StrokeSvg size={size}>
        <path d="M 2 12 C 6 5.5 18 5.5 22 12 C 18 18.5 6 18.5 2 12 Z" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </StrokeSvg>
    )
  }
  // Closed: a sleeping lid with lashes.
  return (
    <StrokeSvg size={size}>
      <path d="M 2 10.5 C 6 16.5 18 16.5 22 10.5" />
      <path d="M 5 14.8 L 3.4 17.4" />
      <path d="M 12 16 V 19" />
      <path d="M 19 14.8 L 20.6 17.4" />
    </StrokeSvg>
  )
}

// ---------- PinIcon ----------

export function PinIcon({ size = 20 }: { size?: number }): React.ReactElement {
  // A pushpin: flat head, tapering body, needle into the ground.
  return (
    <StrokeSvg size={size}>
      <path d="M 8.5 3 H 15.5 V 9.5 L 18 12.5 H 6 L 8.5 9.5 Z" fill="currentColor" fillOpacity={0.22} />
      <path d="M 12 12.5 V 20.5" />
    </StrokeSvg>
  )
}
