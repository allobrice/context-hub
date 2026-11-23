export type RovingOrientation = 'horizontal' | 'vertical' | 'both'

const KEYS: Readonly<
  Record<RovingOrientation, { next: readonly string[]; previous: readonly string[] }>
> = {
  horizontal: { next: ['ArrowRight'], previous: ['ArrowLeft'] },
  vertical: { next: ['ArrowDown'], previous: ['ArrowUp'] },
  both: { next: ['ArrowRight', 'ArrowDown'], previous: ['ArrowLeft', 'ArrowUp'] },
}

/**
 * Index cible d'une navigation clavier « focus itinérant » (APG) : flèches en boucle, Début, Fin.
 * Retourne null si la touche ne concerne pas la navigation.
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  orientation: RovingOrientation,
): number | null {
  if (count === 0) return null
  const last = count - 1
  if (KEYS[orientation].next.includes(key)) return current >= last ? 0 : current + 1
  if (KEYS[orientation].previous.includes(key)) return current <= 0 ? last : current - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  return null
}
