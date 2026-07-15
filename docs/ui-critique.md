# UI critique — ranked improvements (three-lens panel, July 2026)

From three critics (senior-usability, cabinetmaker workflow, visual craft) reviewing
live screenshots + source, deduplicated and ranked by value-for-effort.

**Do first:** Give the view strip its own bench band instead of floating over the model; Make Nudge camera-relative so 'Left' always moves the piece left on screen; Always-visible scrollbars on both panels, and stop the Nudge grid clipping

## 1. Make Nudge camera-relative so 'Left' always moves the piece left on screen  `high/small`

In Inspector.tsx nudge() (line 400), stop applying fixed world deltas. Get yaw via useBus.getState().camera?.yawDeg() ?? 0, quantize to the nearest 90 degrees, and rotate the (dx, dz) delta by that angle before applying — the same math turnAxis() in rotate.ts already uses for Tip/Tilt. Up/Down stay world-vertical. Add a unit test asserting that at yaw 180 (Back view), Nudge Left produces +x.

## 2. Frame the camera on a newly added piece and never let labels bury it  `high/small`

In LeftPanel.tsx, after addPart(item) in both the solid and hole click handlers (lines 83, 96-100), call useBus.getState().camera?.showEverything() (or focusOn(newId) if addPart returns the id) so 'Board' visibly produces a board. In the label layer, skip rendering a dimension pill when the piece's projected bbox is under ~80px so labels never cover the piece they annotate.

## 3. Always-visible scrollbars on both panels, and stop the Nudge grid clipping  `high/small`

In index.css set .wb-left, .wb-right { overflow-y: scroll } with styled always-on scrollbars: ::-webkit-scrollbar { width: 14px }, thumb background var(--panel-edge), border-radius 7px, 3px var(--panel) border, transparent track. Also add min-width: 0 to .wb-btn-grid-3 .wb-btn so all six nudge buttons fit inside the 312px column instead of clipping at the panel edge. Without this, macOS overlay scrollbars leave 'Remove This Piece', TURN, and NUDGE invisible below the fold — a novice concludes the app can't delete or rotate.

## 4. Give the view strip its own bench band instead of floating over the model  `high/medium`

All three critics flagged this. Make .wb-center a flex/grid column: the canvas wrapper gets flex:1 + position:relative (label layer, coach, toasts stay inside it), and below it render a permanent opaque band — background var(--panel), border-top 2px solid var(--panel-edge), padding 10px 14px — holding SnapReadout (left), the view buttons (center), and spin/zoom/Show Everything (right). Delete position:absolute from .wb-viewstrip and .wb-snap-readout (index.css line 319). The canvas ends above the band, so camera.showEverything() automatically fits the visible rectangle and the model is never occluded. This also moots the drag-readout collision at bottom:84px — re-anchor .wb-drag-readout relative to the now-honest canvas area (e.g. bottom:16px). Four fixed regions preserved; the strip becomes the bottom edge of the center region.

## 5. Enforce the 18px type floor with a five-token scale and one label style  `high/small`

The critic proposed a 16px floor — the contract says 18px+, so the floor is 18px. Define tokens in :root — --type-title: 26px, --type-numeric: 22px, --type-body: 18px, --type-label: 18px — and sweep all 14 ad-hoc font sizes in index.css to resolve to a token: .wb-piece-row .dims 13.5→18, .wb-hint 14.5→18, .wb-role-card .sub 13→18, .wb-recent-card .date 14→18, chips 15→18, .wb-field-label 15→18. While sweeping, unify the two near-twin label styles: group headers keep .wb-section-title caps + letter-spacing; field labels become 18px weight 600 sentence case in var(--ink-soft); in Inspector.tsx move parentheticals like '(one snap step)' into a .wb-hint line beneath the header. Also remove nowrap/ellipsis from .wb-piece-row .dims so the full '24 × 10 × 3/4' always shows.

## 6. Bring every touch target up to the 48px contract minimum  `medium/small`

In index.css: .wb-chip min-height 42→48px with padding 10px 16px; .wb-piece-row checkbox 22→28px wrapped in a label with 10px padding for a 48px hit zone; .wb-piece-row .pin min-width/min-height 48px. In Coach.tsx replace the tiny corner ✕ (4px/8px padding) with a full-width wb-btn reading 'Got It' at the bottom of the bubble and delete the .wb-coach .x styles. These are the controls he uses most (3/4 ply, drill sizes) and needs most (dismissing a coach mark).

## 7. Separate camera words from wood words: 'Look Left/Right' vs 'Turn Left/Right'  `medium/small`

The view strip's spin buttons (ViewStrip.tsx lines 44-63) are icon-only ↺/↻, violating the app's own text+icon rule, and the inspector has two buttons both labeled just 'Turn' (Inspector.tsx lines 302-306). Label the strip buttons 'Look Left' / 'Look Right' (joining the eye-movement family of Front/Back/Left Side) and the inspector buttons 'Turn Left' / 'Turn Right'. The words alone now distinguish moving the eye from moving the wood.

## 8. Show the gap between two selected pieces  `high/small`

In MultiPanel (Inspector.tsx line 81), when selection.length === 2 and both bboxes exist (they're already collected for lineUp), compute per-axis clearance (gapX = max(minB[0]-maxA[0], minA[0]-maxB[0]), same for y/z) and render a wb-note at the top: 'Space between: 10 1/4" up and down' per positive-gap axis (formatted with formatLength, worded left-and-right / up-and-down / front-to-back); 'These pieces are touching' when gaps are ~0; 'These pieces overlap' when negative. Shelf spacing and reveal gaps are the daily bread of cabinetmaking and the data is already in hand — zero new commands.

## 9. Disable — never hide — the 'Angle (spin on the bench)' section  `medium/small`

Inspector.tsx line 321 unmounts the angle chips whenever rotation X/Z aren't multiples of 360, a direct 'nothing hides' violation: tip a board and a control he used a minute ago vanishes. Always render the group; when the piece isn't upright, render the same chips disabled (opacity 0.45, existing :disabled styling) with a wb-hint: 'Stand the piece upright to spin it on the bench — the Turn buttons above still work.' The existing upright check just switches enabled/disabled instead of mount/unmount.

## 10. Merge the duplicate 3/4-inch thickness chips  `medium/small`

THICKNESS_PRESETS (Inspector.tsx lines 25-26) has '3/4 ply' and '1x (3/4)' both at 0.75*IN, and the value-match active test lights both orange simultaneously — two settings appearing 'on' at once quietly erodes trust. Replace with one chip: { label: '3/4 (ply or 1x)', mm: 0.75*IN }. Four chips, one highlighted, and the row likely fits one line in the 312px panel.

## 11. Fix the glitch-looking floor: flat plane, soft contact shadows, calmer light  `high/medium`

The stair-stepped dark shadow smears in ang-CornerView.png read as 'the app is broken' — the worst possible signal for a software novice. In world.ts, drop the DirectionalLight from 1.5 to ~0.9 and raise the HemisphereLight to ~1.3; either fix real shadows (bias -0.0005, normalBias 0.02, 2048 map, larger radius) or swap to soft radial-gradient contact-shadow planes under pieces; lighten the plank fill in textures.ts from #cdb289 toward #dcc7a0 with lower-contrast seams. Acceptance test: no stepped artifacts in the corner view at any zoom.

## 12. Add a 'WHERE IT SITS' group: typeable position, not nudge-and-count  `high/medium`

Placing a shelf exactly 11 1/4" up currently means 180 nudge clicks. Add a permanent group to SinglePanel between MEASUREMENTS and TURN using the existing DimField component: 'Bottom edge above the bench' (bbox.min[1]; commit via position[1] += newValue - bbox.min[1]), 'From the left end', and 'From the front' (offsets from the project bbox of other solids). All snapped to doc.snapStep, all undoable through the normal updateParts path. Keep 'Drop to Floor' beneath. Three fields, no new modes, and the single biggest capability gap for actually building furniture.
