**English** · [Português](README.md)

# Prancheta CAD

A **floor plan editor** that runs in the browser: real-world scale, automatic
dimensions, an AutoCAD-style command line, and a 3D view of the walls.

One HTML file. No server, no build step, no dependencies, no install.

**▶ [Open the editor](https://rt3norio.github.io/prancheta-cad/)** — it loads with a
sample plan you can start editing right away.

> The interface and commands are in Brazilian Portuguese. This page explains
> everything an English-speaking user needs in order to use it; a short glossary at
> the end maps every on-screen term.

---

## Why it exists

Web floor-plan tools tend to land at one of two extremes: either they are
"little-house drawers" with no scale and no dimensions, or they are full CAD systems
that need an account, a plugin, or an install.

Prancheta sits in between. It draws in **actual millimetres**, produces
**dimensions**, and accepts the same coordinate entry that AutoCAD users already have
in their fingers — `@300,0`, `@400<90`, direct distance entry with ortho locked. But
it opens with a double click and fits in a single file.

It is meant for quickly capturing a room, studying a furniture layout, or passing a
measurement along without opening a real CAD package.

---

## Getting started

**On the web:** [rt3norio.github.io/prancheta-cad](https://rt3norio.github.io/prancheta-cad/)

**Locally:** download `prancheta.html` and open it with a double click. It works
offline, and that is the version where writing files to disk works without
restrictions.

The drawing autosaves to the browser (`localStorage`) on every change, so closing the
tab does not lose your work.

---

## What it can do

- **Walls** drawn as a chain, with thickness and ceiling height, corners joined
  automatically
- **Doors and windows** inserted into the wall you click, with width, height and
  sill, and door swing flippable on both axes — hinge left or right, leaf sweeping
  inward or outward
- **Furniture** as boxes with a name, height, base elevation and a pastel colour —
  desk, bed, wardrobe, counter, wall cabinet
- **Dimensions** generated automatically per wall and around the overall outline,
  plus manual dimensions you can edit
- **3D view** with extruded walls and genuinely hollow openings
- **Export** the drawing as `.json` and the vector as 1:1 `.svg`

---

## Tools

Left-hand bar; every tool is also reachable by typing its command. The panel below
the bar changes to match the active tool or the selected object, and every field
explains itself on hover.

| Tool | Portuguese label | Command | How to use |
|---|---|---|---|
| Select | Selec | `Esc` | Click an object to edit its measurements in the panel |
| Wall | Parede | `L` | Click point to point; `Enter` or right-click ends the chain |
| Door | Porta | `POR` | Click on a wall |
| Window | Janela | `JAN` | Click on a wall |
| Furniture | Móvel | `CX` | Click two opposite corners |
| Dimension | Cota | `DIM` | Two points to measure, then a third places the line |
| Measure | Medir | `DI` | Reports distance, Δx, Δy and angle; creates nothing |
| Pan | Pan | `P` | Drags the view until you press `Esc` |
| Zoom | Zoom | `Z` | Fits the whole drawing |
| Move | Mover | `M` | Object, base point, destination |
| Copy | Copiar | `CO` | Same as move, keeping the original |
| Delete | Apagar | `E` | Removes whatever is selected |

Clicking an existing object opens its properties: an opening gives you width, height,
sill and position along the wall — and, for a door, two buttons that flip the
**hinge** (which end it swings from) and the **swing direction** (which face of the
wall the leaf sweeps); a piece of furniture gives you name, dimensions, base
elevation, rotation and colour; a wall gives you thickness, ceiling height and its
measured length; a dimension gives you its offset.

---

## Command line

The bottom bar takes commands the way AutoCAD does. `Enter` on an empty line repeats
the last command, `Esc` cancels, and the space bar acts as `Enter` when what you
typed is a command.

### Coordinates

The four formats, always in the current working unit:

| Type | Meaning |
|---|---|
| `300,150` | Absolute X,Y coordinate |
| `@300,0` | Relative to the last point |
| `@400<90` | Relative polar: distance `<` angle in degrees |
| `300` | Direct distance along the cursor direction (with ortho on) |

### Settings

| Command | What it does |
|---|---|
| `ESP 15` | Wall thickness |
| `ALT 280` | Ceiling height |
| `PALT 210` · `JALT 120` · `PEIT 90` | Door height, window height, sill height |
| `INV` · `INVS` | Flip the door's hinge side and its swing direction |
| `COR 1..8` | Furniture colour |
| `GRADE 10` | Grid step |
| `UN mm\|cm\|m` | Working unit |
| `Z` | Zoom extents |
| `3D` | Toggle the 3D view |
| `CORTE 120` | Wall cut height in the 3D view; no argument toggles it |
| `AJUDA` | Full list inside the editor itself |

### Shortcuts

`F8` ortho · `F9` grid snap · `F3` object snap · `F11` tracking · `F2` console ·
`Delete` · `Ctrl+Z` / `Ctrl+Y` undo and redo · arrow keys pan the view, faster with
`Shift` · `Alt+drag` or middle button also pan, at any time · mouse wheel to zoom at
the cursor.

## Console

The command bar is **hidden by default**, so the drawing gets the whole screen.
Typing any letter opens it automatically, and `F2` or the `Console` button toggle it
by hand. Nothing is lost while it is closed: shortcuts keep working and messages
appear on a strip over the drawing, red when they are errors. The preference is
remembered between sessions.

---

## Snapping

With **OSnap** on, the cursor snaps to wall **faces**, to the corners where two faces
meet, and to furniture edges. That is what lets a piece of furniture sit against a
wall without sinking into it.

The detail that matters: a wall is stored by its **centreline**, which runs down the
middle of its thickness. Snapping to the centreline would bury the furniture half a
wall deep. So any snap candidate that falls inside the masonry is discarded — and
while you are drawing walls the priority flips back to the centreline, which is what
walls are actually traced along.

Cursor markers: square for endpoint and corner, X for intersection, hourglass for
face, triangle for midpoint.

### Tracking (F11)

Hover a corner, wait a moment — a yellow `+` appears, the point is **acquired** — and
move the cursor away. Horizontal and vertical guides extend from it, and the cursor
locks onto them.

This is what ortho alone cannot do: ortho aligns with the **point you are drawing
from**, tracking aligns with **any corner you hovered earlier**. Acquire two points and
the crossing of their guides becomes a snap point — that is how you pick up, say, one
wall's vertical alignment at another wall's horizontal height.

Hovering the same point again releases it, `Esc` clears them all, and two points stay
acquired at a time. Object snap takes priority over the guides.

---

## Dimensions

**Automatic** ones are regenerated every frame: one per wall, offset to the outside,
plus two for the overall outline. They are not objects — clicking one selects the
wall it measures. Toggle them with the `Cotas` button.

**Manual** ones (`DIM`) are real objects: selectable, with an editable offset, and
they can be moved, copied and deleted.

Architectural 45° ticks, text that stays readable at any angle, and the measurement
shown in the current working unit.

---

## 3D view

Walls are extruded to the ceiling height and openings are genuinely **hollow**: each
wall is decomposed into a position × height grid, cells falling inside an opening are
discarded, and only boundary faces become geometry — no leftover interior surfaces.

Furniture becomes boxes in its own colour, honouring the base elevation, which covers
wall cabinets and shelves.

Rendered with WebGL and a real depth buffer. Drag to orbit, `Shift+drag` to pan,
wheel to zoom. Without WebGL it falls back to a software renderer.

The **Corte** button (`CORTE` command) trims the walls at 120 cm, like an open
dollhouse. Without it a 280 cm ceiling hides all the furniture and you only ever see
the house from outside — which is why it is on by default. Turn it off to inspect the
closed façades, or pass a height: `CORTE 90`.

---

## Files

`Salvar` (save) writes a `.json`; `Abrir` (open) reads it back, and **dragging the
file onto the plan** works too. `SVG` exports at 1:1 scale, with 1 file unit = 1 mm,
ready for Illustrator, Inkscape or printing.

The `JSON` and `COLAR` commands show and accept the drawing as text, for when writing
a file is not possible — inside a sandbox that blocks downloads, for instance.

### Drawing format

Plain, stable JSON, easy to generate from a script:

```jsonc
{
  "walls": [
    // wall centreline, thickness and height — all in millimetres
    { "id": 1, "ax": 0, "ay": 0, "bx": 9000, "by": 0, "t": 150, "h": 2800 }
  ],
  "ops": [
    // opening in a wall: d = distance along it to the centre of the opening
    // kind is "porta" (door) or "janela" (window); sill is the sill height
    { "id": 9, "w": 1, "d": 6500, "wid": 800, "kind": "porta", "h": 2100, "sill": 0 }
  ],
  "boxes": [
    // furniture: centre, dimensions, rotation in radians, height and base elevation
    // "nome" is the label drawn on the plan
    { "id": 20, "x": 1900, "y": 5075, "w": 1600, "d": 2000,
      "rot": 0, "h": 550, "z": 0, "color": "#BCD2E0", "nome": "Cama" }
  ],
  "dims": [
    // manual dimension: the measured segment and the dimension line offset
    { "id": 30, "ax": 0, "ay": 0, "bx": 3000, "by": 0, "off": 600 }
  ],
  "seq": 31
}
```

Every measurement is in millimetres. The working unit (`mm`, `cm`, `m`) only affects
what you type, the panel fields and the dimension text — never the file.

---

## How it is built

One file, three blocks: a `<style>` holding the theme as CSS tokens, the interface
markup, and a `<script>` with the whole editor. A 2D canvas for the plan and a second
WebGL canvas underneath for the 3D view.

Decisions worth knowing before touching the code:

- **Millimetres as the internal unit.** Avoids accumulated rounding error and reduces
  unit conversion to a single factor.
- **Walls stored by centreline.** Faces are derived at draw and snap time, so changing
  the thickness recomputes nothing.
- **Openings belong to their wall** and are positioned by distance along it, not by
  absolute coordinate. Moving the wall carries the opening along.
- **Per-vertex colour in 3D.** The shadow/light pair for each colour is resolved on
  the CPU according to the light or dark theme and fed to the shader as an attribute —
  that is what lets every piece of furniture carry its own pastel.
- **The floor is kept out of the sort** in the software renderer. It is one large
  rectangle whose centroid does not represent the depth of any point on it, so sorting
  it alongside everything else made it jump in front of the walls as the camera
  orbited.

---

## Tests

```bash
node test.mjs prancheta.html
```

131 assertions, no dependencies: the harness extracts the `<script>` from the HTML,
runs it in a context with a stubbed DOM and an instrumented canvas, and checks the
real geometry — hollow openings in 3D, camera matrices, face snapping, hit-testing
for every object type, a round trip through the file format, and the exported SVG.

Sections marked `REGRESSÃO:` (regression) pin down bugs that already happened and must
not come back: the floor jumping in front of the walls, the door that could not be
selected by its leaf or swing arc, dimensions with no hit-testing at all, and the
overall dimension that was drawn inside the plan instead of outside it.

---

## What it does not do yet

Stated up front so you do not discover it mid-drawing:

- **No DXF.** It neither imports nor exports AutoCAD's format. SVG is the bridge today.
- **No `OFFSET`, `TRIM`, `EXTEND` or `ROTATE`** for walls. Since walls are drawn as a
  chain along the centreline with automatic joins, trim and extend are rarely missed;
  offset would be useful.
- **No layers**, no floor hatching, no angular dimensions, no stairs, no roof.
- **Single storey.**
- **Furniture is boxes.** There is no block library and no curved geometry.

---

## Contributing

The project is deliberately a single file — please keep it that way. Before opening a
PR, run `node test.mjs prancheta.html` and add an assertion for whatever you changed.
If the PR fixes a bug, leave the test in the `REGRESSÃO:` section reproducing it.

---

## License

[BSD Zero Clause](LICENSE) (0BSD).

Do whatever you want: copy it, change it, ship it, put it inside something you sell,
take my name off it. No permission needed, no attribution needed, no notice to keep.
The only thing the text does beyond granting everything is disclaim warranty — which
protects the author without getting in the user's way.

It is the most permissive licence that still holds up under Brazilian law, where the
author lives. Public-domain dedications like the Unlicense and CC0 are looser on
paper, but Brazilian law does not let an author waive moral rights, which leaves them
on uncertain ground there. 0BSD reaches the same practical result through an ordinary
licence, is OSI-approved and is recognised by SPDX.

---

## Glossary

Every term you will see on screen:

| On screen | English |
|---|---|
| Parede | Wall |
| Porta · Janela | Door · Window |
| Móvel | Furniture |
| Cota | Dimension |
| Medir | Measure |
| Mover · Copiar · Apagar | Move · Copy · Delete |
| Selec | Select |
| Espessura | Thickness |
| Pé-direito | Ceiling height |
| Peitoril | Sill height |
| Largura · Profundidade · Altura | Width · Depth · Height |
| Base | Base elevation |
| Rotação | Rotation |
| Afastamento | Offset |
| Dobradiça · Sentido | Hinge · Swing direction |
| Pan · Zoom | Pan · Zoom |
| Rastro | Tracking |
| Corte | Wall cut (dollhouse view) |
| Console | Console |
| Posição | Position |
| Nome | Name |
| Grade | Grid |
| Orto | Ortho |
| Unid | Unit |
| Salvar · Abrir · Novo · Ajuda | Save · Open · New · Help |
| Comando | Command |
