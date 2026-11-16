import { COLORS, MONO_FONT } from "../../theme.js";

/**
 * A small fixed line drawing of a triaxial ellipsoid with its three
 * semi-axes labelled: a along X (towards the viewer), b along Y, c along Z.
 * It does not change with the numbers: it shows what a, b and c name.
 * @param {{ label: string }} props label is the figure's accessible name.
 */
export default function EllipsoidFigure({ label }) {
  const axis = { stroke: COLORS.ink, strokeWidth: 1.6, strokeLinecap: "round" };
  const text = { fill: COLORS.ink, fontFamily: MONO_FONT, fontSize: 13, fontWeight: 650 };
  return (
    <svg viewBox="0 0 200 140" width="200" height="140" role="img" aria-label={label} style={{ display: "block", maxWidth: "100%", height: "auto" }}>
      <ellipse cx="100" cy="70" rx="86" ry="54" fill={COLORS.paper} stroke={COLORS.ink2} strokeWidth="1.4" />
      {/* The equator: its far half dashed. */}
      <path d="M14 70a86 20 0 0 1 172 0" fill="none" stroke={COLORS.faint} strokeWidth="1.2" strokeDasharray="3 3" />
      <path d="M14 70a86 20 0 0 0 172 0" fill="none" stroke={COLORS.ink2} strokeWidth="1.2" />
      {/* The meridian through the Z axis. */}
      <path d="M100 16a22 54 0 0 0 0 108" fill="none" stroke={COLORS.faint} strokeWidth="1.2" strokeDasharray="3 3" />
      <line x1="100" y1="70" x2="186" y2="70" {...axis} />
      <line x1="100" y1="70" x2="100" y2="16" {...axis} />
      <line x1="100" y1="70" x2="62" y2="90" {...axis} />
      <circle cx="100" cy="70" r="2.4" fill={COLORS.ink} />
      <text x="146" y="64" {...text}>b</text>
      <text x="106" y="38" {...text}>c</text>
      <text x="72" y="100" {...text}>a</text>
      <text x="190" y="74" fill={COLORS.muted} fontFamily={MONO_FONT} fontSize="11">Y</text>
      <text x="96" y="11" fill={COLORS.muted} fontFamily={MONO_FONT} fontSize="11">Z</text>
      <text x="50" y="100" fill={COLORS.muted} fontFamily={MONO_FONT} fontSize="11">X</text>
    </svg>
  );
}
