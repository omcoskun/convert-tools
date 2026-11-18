# Black space with stars that follow the camera

Date: 2026-11-19. Size: a small change.

## Intent

The owner showed Apple Maps' satellite globe: the space around the Earth is
black, and the stars shift as the globe is turned, as if the camera were
orbiting the Earth. They asked for the same here, and for it to cost little
while the map moves.

Today the space behind the globe (`SpaceBackdrop.jsx`) is navy (`#030711`)
with two blue and purple glows, and its stars are drawn once per resize and
never move.

## Goals

- The space behind the globe is black, with no coloured glows, for every
  basemap (the backdrop is shared; the flat 2D map never shows space).
- The stars move with the camera:
  - moving east sends them right;
  - moving north sends them up;
  - tilting the map sends them down;
  - rotating the map turns them with it.

  This is how stars far behind the Earth move as the camera orbits it. They
  move about 3 px per degree, roughly a third as fast as the globe's surface
  at the whole-world view. Zooming does not move them.
- Panning the map stays smooth: the stars are drawn only when the camera has
  moved, at most once per frame, with a few canvas fills.

## Non-goals

- A real sky (true constellations at the right sidereal time).
- Stars in the 2D view (space never shows there).

## Anti-goals

- Visible tiling of the star pattern.
- Stars jumping when the map crosses the antimeridian.
- A per-frame cost that grows with the number of stars.

## Approaches

1. **Two repeating star tiles moved by a pattern transform (chosen).**
   - The stars are drawn once into two small seamless tiles (389 and 547 px,
     so the combined pattern only repeats after about 210,000 px).
   - Each frame fills the screen canvas with black and then with the two
     patterns. Each pattern's transform is set from the camera.
   - The cost is three fills per frame, whatever the number of stars. The
     memory is about 7 MB at a device pixel ratio of 2.
2. **Stars on a sphere, projected each frame.**
   - Physically exact, but costs one projection and one draw per star per
     frame on the main thread while MapLibre is busy.
   - At the map's real field of view the stars would also race past faster
     than the Earth itself.
3. **CSS-moved background images.**
   - Needs blob or data URLs (against the production CSP), or an oversized
     composited layer to allow rotation (tens of MB of GPU memory).

## Design

- **`src/map/stars.js` (pure; trig allowed, as for the other presentation-math
  modules):**
  - `STAR_SPEED`, the speed in px per degree.
  - `STAR_LAYERS`, the two tiles' sizes, counts, seeds, radii and alphas.
  - `starTile(layer)`, the tile's stars: seeded and deterministic.
  - `unwrapLongitude(unwrapped, previous, longitude)`. This keeps the
    longitude continuous across ±180°, so the tile sizes need not divide the
    360° sweep.
  - `starTransform(camera, viewport)`, the pattern matrix `[a, b, c, d, e, f]`
    in device pixels:
    - it rotates by −bearing about the screen centre;
    - it shifts the pattern by (longitude, −latitude) × speed, reduced modulo
      the tile size;
    - it then shifts down by pitch × speed.
- **`SpaceBackdrop.jsx`:**
  - Builds the tiles at the device pixel ratio (capped at 2), drawing each
    star again across the edges so the tile is seamless.
  - Takes `subscribeView` and `readCamera` from `useMapStage`. It redraws
    inside the map's own view notice, once per map frame, so the stars never
    lag the globe by a frame.
  - Skips the redraw when the camera has not moved (a pure zoom), in the 2D
    view, and for `prefers-reduced-motion`. In those cases the stars stay
    still: parallax is a known motion trigger.
- **`useMapStage.readCamera()`:** returns centre, bearing, pitch and whether
  the globe is drawn, or `null` before the map exists.
- **Colours:** the stage, the canvas and MapLibre's `sky-color` become black.
  The atmosphere's blue rim stays.
