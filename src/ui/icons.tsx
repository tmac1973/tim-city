import type { JSX } from 'preact';

/** Small stroke icons, drawn on a 24×24 grid in the current text color. */
const paths: Record<string, JSX.Element> = {
  road: (
    <>
      <path d="M8 3 5 21M16 3l3 18" />
      <path d="M12 4v3M12 10.5v3M12 17v3" />
    </>
  ),
  rail: (
    <>
      <path d="M9 3v18M15 3v18" />
      <path d="M6 6h12M6 10h12M6 14h12M6 18h12" />
    </>
  ),
  power: <path d="M13 2 5 13h6l-1 9 8-11h-6z" />,
  bulldoze: (
    <>
      <rect x="4" y="9" width="10" height="7" rx="1" />
      <path d="M14 12h3l3 5H3M7 9V6h5v3" />
      <circle cx="6.5" cy="19" r="1.5" />
      <circle cx="12.5" cy="19" r="1.5" />
    </>
  ),
  raise: (
    <>
      <path d="M3 20c3-6 6-9 9-9s6 3 9 9" />
      <path d="M12 9V3M9 6l3-3 3 3" />
    </>
  ),
  lower: (
    <>
      <path d="M3 13c3 6 6 7 9 7s6-1 9-7" />
      <path d="M12 3v7M9 7l3 3 3-3" />
    </>
  ),
  level: (
    <>
      <path d="M3 17h18" />
      <path d="M6 12h12M9 9l-3 3 3 3M15 9l3 3-3 3" />
    </>
  ),
  paused: <path d="M8 5v14M16 5v14" />,
  slow: <path d="M9 6v12l7-6z" />,
  normal: <path d="M5 6v12l6-6zM12 6v12l6-6z" />,
  fast: <path d="M3 6v12l5-6zM9 6v12l5-6zM15 6v12l5-6z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
