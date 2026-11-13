// Small stroke icons, decorative: the button or link around them carries the
// accessible name. Tool icons use the tool ids of App.jsx.
const PATHS = {
  length: (
    <>
      <path d="m4 16 12-12 4 4L8 20 4 16Z" />
      <path d="m13 7 2 2m-5 1 2 2m-5 1 2 2" />
    </>
  ),
  positions: (
    <>
      <path d="M12 21s-6.5-5.9-6.5-11a6.5 6.5 0 0 1 13 0c0 5.1-6.5 11-6.5 11z" />
      <path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    </>
  ),
  crs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5h14M5 17.5h14" />
    </>
  ),
  distance: (
    <>
      <circle cx="5.5" cy="17.5" r="2" />
      <circle cx="18.5" cy="6.5" r="2" />
      <path d="M7.3 16.3C10 9 13 8.4 16.7 7.6" strokeDasharray="2.4 2.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  focus: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="9" cy="14" r="1.6" />
      <circle cx="15" cy="10" r="1.6" />
      <path d="m10.4 12.9 3.2-1.8" />
    </>
  ),
  world: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3c-2.6 2.8-3.6 5.7-3.6 9s1 6.2 3.6 9c2.6-2.8 3.6-5.7 3.6-9S14.6 5.8 12 3Z" />
    </>
  ),
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  expand: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />,
  collapse: <path d="M4 9h5V4m6 0v5h5M9 20v-5H4m11 5v-5h5" />,
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  swap: <path d="M7 7h12m0 0-3.5-3.5M19 7l-3.5 3.5M17 17H5m0 0 3.5-3.5M5 17l3.5 3.5" />,
  clear: <path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4.5m0 2.6v.1" />
    </>
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
};

export default function Icon({ name, size = 20, strokeWidth = 1.7 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      {PATHS[name]}
    </svg>
  );
}
