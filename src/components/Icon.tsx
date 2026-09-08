import type { CSSProperties } from "react";

const paths = {
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  folder: "M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ruler: "m3 16 13-13 5 5L8 21l-5-5Zm5-5 3 3m1-7 3 3m1-7 3 3",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  compare: "M4 3v18M20 3v18M4 6h6v12H4M20 6h-6v12h6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  filter: "M3 6h18M6 12h12M9 18h6",
  home: "m3 10 9-8 9 8M5 9v12h14V9M9 21v-8h6v8",
  target: "M12 2v4m0 12v4M2 12h4m12 0h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  link: "m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  print: "M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6v-7",
  info: "M12 11v6m0-10v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  logout: "M9 3H3v18h6m6-14 5 5-5 5M8 12h12",
  terrain: "m2 20 7-14 4 8 3-5 6 11H2ZM6 12l3 2 2-2",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
  copy: "M8 8h13v13H8V8ZM16 8V3H3v13h5",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  undo: "m8 4-5 5 5 5M3 9h12a6 6 0 0 1 0 12",
  book: "M3 3h7a2 2 0 0 1 2 2v16a4 4 0 0 0-4-2H3V3Zm18 0h-7a2 2 0 0 0-2 2v16a4 4 0 0 1 4-2h5V3Z"
} as const;
export type IconName = keyof typeof paths;

export default function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
