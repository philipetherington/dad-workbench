# Workbench

A CAD app simple enough to learn in ten minutes, built for a woodworker who
found commercial CAD too confusing. Design shelves, jigs, brackets, and
3D-printable parts by placing lumber-like pieces on a virtual bench and
cutting holes in them — then get a cut list, an STL, a DXF shop drawing,
or an OpenSCAD file out.

## Running it

```
npm install
npm run dev        # http://localhost:5173
npm test           # 71 unit + integration tests (runs the real CSG kernel)
npm run build      # production build in dist/
```

## How it works

- **Model** (`src/model/`): a project is a flat list of parts. Each part is a
  parametric primitive (board, cylinder, sphere, cone, wedge, slot) that is
  either **solid wood** or **cuts wood away**. Holes cut every solid they
  touch, live — there is no grouping step. All lengths are stored in
  millimeters; the display layer speaks fractional inches (to 1/32") or mm.
- **Engine** (`src/engine/`): the [Manifold](https://github.com/elalish/manifold)
  WASM kernel evaluates the scene (per-solid CSG so every piece stays
  selectable), detects overlapping solids and idle holes, and produces the
  single watertight z-up mesh used by every exporter.
- **Viewport** (`src/viewport/`): three.js. A clamped turntable camera (no pan,
  no roll — getting lost is structurally impossible), face handles that resize
  one dimension from the anchored opposite face, a single lift arrow for
  height, grid snapping plus 1/4" face magnetism with a "Flush!" flash.
- **Exports** (`src/exporters/`): binary STL, OpenSCAD (readable named modules
  with inch comments), DXF R12 top-view outline, and a printable cut list
  grouped by identical stock.

Conventions that everything relies on are documented at the top of
`src/model/types.ts`. If you change one, `npm test` will object.

## Design rules

The interface follows a fixed contract (see git history for the full spec):
four fixed regions, nothing collapses or hides; 18px+ type and 48px+ targets;
woodworker vocabulary only; rotation is buttons, never gizmos; nothing asks
for confirmation — everything undoes; autosave always, no Save button.
Feature restraint is deliberate: no sketching, no workplanes, no layers,
no materials, no preferences pane.
