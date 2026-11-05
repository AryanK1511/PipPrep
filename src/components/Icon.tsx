const SVG = {
  book: '<path d="M12 7C9 4 5 4 2 5v14c4-1 7 0 10 2 3-2 6-3 10-2V5c-3-1-7-1-10 2Zm0 0v14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.8-3.4a8.5 8.5 0 1 1 15.2-5.1Z"/><path d="M8 10h8m-8 4h5"/>',
  pen: '<path d="m13 6 5 5m-14 9 5-1 11-11a2 2 0 0 0-5-5L4 14Z"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  headphones: '<path d="M3 13v-1a9 9 0 0 1 18 0v1M3 13h3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2Zm18 0h-3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  left: '<path d="M20 12H5m6 6-6-6 6-6"/>',
  sparkle: '<path d="M12 2c.7 6 3.4 8.6 9 10-5.6 1.4-8.3 4-9 10-.7-6-3.4-8.6-9-10 5.6-1.4 8.3-4 9-10ZM20 2v4m-2-2h4"/>',
  chart: '<path d="M3 3v18h18M7 16l4-5 4 2 5-7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 1.8-2.8 2.1-2.8 3.5m0 3h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  external: '<path d="M13 4h7v7m-9 2 9-9m-1 10v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
}

export type IconName = keyof typeof SVG

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: SVG[name] }} />
}
