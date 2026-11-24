/**
 * Tracés repris tels quels des maquettes (design-kit/maquettes/html), viewBox 24, trait currentColor.
 * Données pures : le rendu est fait par <Icon />.
 */
export type IconShape =
  | { readonly tag: 'path'; readonly d: string }
  | { readonly tag: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly tag: 'rect'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly rx: number
    }

const path = (d: string): IconShape => ({ tag: 'path', d })
const circle = (cx: number, cy: number, r: number): IconShape => ({ tag: 'circle', cx, cy, r })
const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => ({
  tag: 'rect',
  x,
  y,
  width,
  height,
  rx,
})

export const ICONS = {
  workspace: [rect(3, 4, 18, 16, 2), path('M3 9h18M8 13h3M8 16h6')],
  lock: [rect(5, 11, 14, 10, 2), path('M8 11V7a4 4 0 0 1 8 0v4')],
  book: [
    path('M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z'),
    path('M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'),
  ],
  tag: [path('M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z'), circle(7.5, 7.5, 1.5)],
  plug: [path('M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4')],
  folder: [path('M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z')],
  user: [circle(12, 8, 4), path('M4 21a8 8 0 0 1 16 0')],
  branch: [
    circle(6, 5, 2),
    circle(6, 19, 2),
    circle(18, 8, 2),
    path('M6 7v10M18 10a6 6 0 0 1-6 6H8'),
  ],
  users: [circle(9, 8, 3), path('M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6')],
  moon: [path('M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z')],
  search: [circle(11, 11, 7), path('m20 20-3.5-3.5')],
  plus: [path('M12 5v14M5 12h14')],
  chevronDown: [path('m6 9 6 6 6-6')],
  list: [path('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
  grid: [rect(3, 3, 7, 7, 1), rect(14, 3, 7, 7, 1), rect(3, 14, 7, 7, 1), rect(14, 14, 7, 7, 1)],
  alertTriangle: [path('M12 3 2 20h20z'), path('M12 10v4M12 17h.01')],
  refresh: [path('M20 12a8 8 0 1 1-2.3-5.7L20 8M20 3v5h-5')],
  x: [path('M18 6 6 18M6 6l12 12')],
  shield: [path('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z')],
  shieldCheck: [path('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'), path('m9 12 2 2 4-4')],
  shieldAlert: [path('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'), path('M12 9v4M12 16h.01')],
  archive: [rect(3, 4, 18, 4, 1), path('M5 8v12h14V8M10 12h4')],
  pencil: [path('M4 20h4L19 9l-4-4L4 16z')],
  more: [circle(5, 12, 1), circle(12, 12, 1), circle(19, 12, 1)],
  terminal: [path('m4 17 6-5-6-5M12 19h8')],
  clock: [circle(12, 12, 9), path('M12 7v5l3 2')],
  link: [
    path(
      'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    ),
  ],
  merge: [path('M6 3v6a6 6 0 0 0 6 6h6M15 12l3 3-3 3')],
  trash: [path('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13')],
  // Absente des maquettes : confirmation « Copié ».
  check: [path('M20 6 9 17l-5-5')],
} as const satisfies Record<string, readonly IconShape[]>

export type IconName = keyof typeof ICONS
