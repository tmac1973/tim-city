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
  residential: <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  commercial: (
    <>
      <path d="M4 20V9h16v11M3 20h18" />
      <path d="M4 9l2-5h12l2 5M9 20v-5h6v5M7 12h2M15 12h2" />
    </>
  ),
  industrial: (
    <>
      <path d="M3 20V11l5 3V11l5 3V7h3v13M3 20h18M19 20V4h2v16" />
    </>
  ),
  coal: (
    <>
      <path d="M4 20V12h10v8M3 20h18M16 20V8h3v12" />
      <path d="M17 5c0-1 1-1 1-2M7 15h4" />
    </>
  ),
  nuclear: (
    <>
      <path d="M6 20c1.5-4 1.5-9 0-13h8c-1.5 4-1.5 9 0 13M3 20h18" />
      <path d="M17 20V13h3v7M8 4c1-1 3-1 4 0" />
    </>
  ),
  police: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6zM9.5 12l2 2 3.5-4" />,
  fire: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 .5-2.5.5-5.5.5-8z" />,
  park: (
    <>
      <path d="M12 21v-6M12 3 6.5 11h3L7 15h10l-2.5-4h3z" />
    </>
  ),
  largePark: (
    <>
      <path d="M8 21v-4M8 5 4 11h2l-2 4h8l-2-4h2zM17 21v-3" />
      <ellipse cx="17" cy="14" rx="4" ry="2.5" />
    </>
  ),
  stadium: (
    <>
      <ellipse cx="12" cy="13" rx="9" ry="5" />
      <ellipse cx="12" cy="13" rx="4.5" ry="2.2" />
      <path d="M4 8v-3M20 8v-3" />
    </>
  ),
  seaport: (
    <>
      <path d="M3 19c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M7 15V5h10v3M17 8v7M9 9h4v6" />
    </>
  ),
  airport: <path d="M21 15.5 13 11V5a1.5 1.5 0 0 0-3 0v6l-8 4.5V17l8-2v3.5L8 20v1.5l3.5-1 3.5 1V20l-2-1.5V15l8 2z" />,
  query: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5M10.5 8v.01M10.5 10.5V13" />
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
