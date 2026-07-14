# Phase 2 — Cabinetmaker's Workbench

Phase 1 proved the interaction model. Phase 2 raises the ceiling to real
cabinet work — joinery, hardware, assemblies, inlays — **without adding a
single new interaction concept**. Everything below is still: click to place,
drag to slide, type fractions, red-striped things cut wood, nothing hides,
everything undoes.

## 1. Attachment (keystone)

`Part.hostId?: string` — a cut or hardware item can belong to a host board.

Semantics:
- Moving the host moves everything attached to it (transitively). Moving an
  attached part does NOT move the host.
- Rotating the host (TURN buttons) rotates attached parts about the same
  world axis through the host's center, composing their rotations identically.
- Deleting the host deletes its attached cuts/hardware (one toast, one undo).
- Cycles are prevented at attach time. Hosts must be solids.
- UX: dropping a joinery cutter or hardware item onto a board face attaches
  it and orients it perpendicular to that face. The inspector shows
  "Attached to Left side · [Let it move freely]" plus **offset fields**
  ("From the end / From the edge / Deep") computed in the host's local frame
  and editable — a cabinetmaker positions a dado by offset, not coordinates.

## 2. Joinery cutters (new left-panel section "JOINERY", red-striped family)

All are role `hole` with placement intelligence. Dado/groove/rabbet size
their span from the host **at evaluation time**, so they keep spanning when
the board is resized.

| Cutter  | Definition | Params |
|---------|-----------|--------|
| Dado    | channel ACROSS the board (full width) | cut width, depth, offset from end |
| Groove  | channel ALONG the board (full length) | cut width, depth, offset from edge |
| Rabbet  | step removed along an end or edge | width, depth, which edge (nearest on drop) |
| Mortise | rectangular pocket, square or rounded ends | length, width, depth |
| Tenon   | material removed AROUND a board end leaving a tongue | tongue thickness, tongue width, length |

Tenon geometry = (end box) − (tongue box), one Manifold difference, one part.

## 3. Hardware (new role `'hardware'`)

```ts
interface HardwareDef {
  id: string; label: string
  category: 'hinges' | 'slides' | 'fasteners' | 'pins' | 'pulls'
  params: { key: string; label: string; options: { label: string; value: number }[] }[]
  visual(m: ManifoldToplevel, params: Params): Manifold      // local frame, y-up,
  cutters(m: ManifoldToplevel, params: Params): Manifold[]   // origin = mounting face
  shoppingLine(params: Params): string
}
```

- Hardware renders metallic gray, never striped, never unions into wood
  exports, never appears on the cut list. Its **cutters** behave exactly like
  holes: they cut every solid they intersect, live. Dropping a Euro hinge on
  a door edge IS the 35 mm cup bore plus pilots.
- New export: **Hardware list** (shopping list), grouped by identical item,
  printed alongside the cut list.

Starter catalog: Euro cup hinge (35 mm bore, 11.5 mm deep, pilots) ·
butt hinge (leaf mortise + pilots) · side-mount drawer slide pair (rail
visual, pilots, 1/2" total clearance rule) · shelf-pin row (5 mm holes,
32 mm pitch — System 32, count + start height params) · wood screw
(#6/#8/#10 × length; pilot + countersink cutter) · pocket screw (15° angled
bore) · dowel pin (Ø6/8/10, matching bores) · knob (single bore) ·
pull (two bores, 96/128 mm centers) · threaded insert.

## 4. Assemblies (builders)

"Drawer…" and "Door…" buttons open one small sheet each:
- **Drawer**: opening W×H×D + slide type + joinery (rabbet or dado) →
  five boards with correct clearances (1/2" total for side-mounts), bottom in
  grooves, glued as a named group ("Drawer 1"), slides attached.
- **Door**: opening W×H + overlay/inset + stile/rail widths → rails, stiles,
  panel in grooves, glued group; hinges placed but positions editable.

Builders are pure functions `(params) => Part[]` — fully unit-testable.

## 5. Inlays & edge profiles

- **Inlay**: a shallow pocket cutter (rectangle / circle / diamond, default
  1/8" deep) + a "Make the matching piece" button that generates a solid
  sized to the pocket minus a clearance (default 0.1 mm, editable) so it
  actually fits.
- **Edge profile**: a cutter swept along one edge of the host —
  roundover (square corner minus quarter cylinder), chamfer (45° triangle),
  cove (quarter cylinder). Param: size; edge chosen by nearest-on-drop,
  changeable via "Next edge" button. Spans the full edge at eval time.

## 6. Materials

`Part.material?: string` (Plywood, Pine, Oak, Maple, Walnut, MDF, or typed) —
a dropdown on boards; the cut list groups by material first. Cabinetmakers
buy by species.

## Non-goals (still)

Free-form curves, raised-panel profiles, true dovetail geometry, CNC toolpaths,
photorealistic rendering. The 25-visible-commands budget grows to ~35 with two
new left-panel sections — still one screen, still nothing hidden.
