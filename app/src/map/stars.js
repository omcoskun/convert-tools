// The stars behind the globe (SpaceBackdrop.jsx). They are drawn once into
// two small tiles that repeat across the screen; each frame only the tiles'
// pattern transform changes. Stars far behind the Earth move against the
// camera as it orbits: moving east sends them right, moving north sends them
// up, tilting the map sends them down, and rotating the map turns them with
// it. Zooming does not move them. Pure: no DOM.

/** CSS px the stars move per degree the camera turns: about a third of the globe's surface at the whole-world view. */
export const STAR_SPEED = 3;

/**
 * The two tiles: faint dust and fewer, brighter stars. Their sizes are
 * primes, so together they repeat only every size × size px.
 * radius in CSS px, alpha 0..1, glow the share of stars with a soft halo.
 */
export const STAR_LAYERS = Object.freeze([
  Object.freeze({ size: 389, count: 84, seed: 8457, radius: [0.3, 0.75], alpha: [0.22, 0.65], glow: 0 }),
  Object.freeze({ size: 547, count: 27, seed: 2741, radius: [0.65, 1.35], alpha: [0.55, 1], glow: 0.3 }),
]);

/**
 * The stars of one tile, deterministic for its seed.
 * @param {{ size: number, count: number, seed: number, radius: number[], alpha: number[], glow: number }} layer
 * @returns {{ x: number, y: number, radius: number, alpha: number, warm: boolean, glow: boolean }[]}
 */
export function starTile({ size, count, seed, radius, alpha, glow }) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const stars = [];
  for (let index = 0; index < count; index += 1) {
    const x = random() * size;
    const y = random() * size;
    // Most stars are faint; brightness drives both size and alpha.
    const brightness = random() * random();
    stars.push({
      x,
      y,
      radius: radius[0] + (radius[1] - radius[0]) * brightness,
      alpha: alpha[0] + (alpha[1] - alpha[0]) * brightness,
      warm: random() < 1 / 7,
      glow: random() < glow,
    });
  }
  return stars;
}

/**
 * The camera longitude without the jump at ±180°: `unwrapped` moved by the
 * shortest turn from `previous` to `longitude`.
 */
export function unwrapLongitude(unwrapped, previous, longitude) {
  const step = ((((longitude - previous) % 360) + 540) % 360) - 180;
  return unwrapped + step;
}

const modulo = (value, period) => ((value % period) + period) % period;

/**
 * The pattern transform [a, b, c, d, e, f] (DOMMatrix order) that draws a
 * tile of `size` CSS px, rendered at `ratio` device px per CSS px, onto a
 * canvas of `width` × `height` CSS px at that ratio. The pattern turns by
 * −bearing about the screen centre, is shifted by (longitude, −latitude) ×
 * STAR_SPEED in its own (north-up) frame, reduced modulo the tile, then by
 * pitch × STAR_SPEED down the screen.
 * @param {{ longitude: number, latitude: number, bearing: number, pitch: number }} camera
 * @param {{ width: number, height: number, ratio: number, size: number }} viewport
 */
export function starTransform({ longitude, latitude, bearing, pitch }, { width, height, ratio, size }) {
  const angle = (-bearing * Math.PI) / 180;
  const cos = bearing === 0 ? 1 : Math.cos(angle);
  const sin = bearing === 0 ? 0 : Math.sin(angle);
  const x = modulo(longitude * STAR_SPEED, size);
  const y = modulo(-latitude * STAR_SPEED, size);
  return [
    cos,
    sin,
    0 - sin, // not -sin: no -0 when unrotated
    cos,
    ratio * (width / 2 + cos * x - sin * y),
    ratio * (height / 2 + pitch * STAR_SPEED + sin * x + cos * y),
  ];
}
