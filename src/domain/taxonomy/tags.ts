import type { Tag } from './types.ts'

const TAG_NAME_PATTERN = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u

/** Forme canonique d'un nom de tag saisi : sans espaces autour, en minuscules. */
export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Minuscules, chiffres, accents et tirets (ex. « a11y », « github-actions », « qualité »). */
export function isValidTagName(name: string): boolean {
  return TAG_NAME_PATTERN.test(name)
}

export type TagRenamePlan =
  | { readonly kind: 'rename'; readonly from: string; readonly to: string }
  /** Le nom cible existe déjà : renommer revient à fusionner. */
  | { readonly kind: 'merge'; readonly from: string; readonly into: Tag }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid' }

/** Décide ce que produit le renommage de `from` en `rawTarget`. */
export function planTagRename(
  tags: readonly Tag[],
  from: string,
  rawTarget: string,
): TagRenamePlan {
  const to = normalizeTagName(rawTarget)
  if (to === from) return { kind: 'unchanged' }
  if (!isValidTagName(to)) return { kind: 'invalid' }
  const existing = tags.find((tag) => tag.name === to)
  return existing ? { kind: 'merge', from, into: existing } : { kind: 'rename', from, to }
}

/** Remplace les tags `sources` par `target` dans une liste, sans doublon et en gardant l'ordre. */
export function applyTagMerge(
  tags: readonly string[],
  sources: readonly string[],
  target: string,
): string[] {
  const sourceSet = new Set(sources)
  const result: string[] = []
  for (const tag of tags) {
    const next = sourceSet.has(tag) ? target : tag
    if (!result.includes(next)) result.push(next)
  }
  return result
}

export interface MergeImpact {
  /** Contextes qui portent au moins un des tags fusionnés. */
  readonly affectedContexts: number
  /** Contextes qui auraient eu le tag cible en double. */
  readonly duplicatesAvoided: number
}

/** Impact chiffré d'une fusion, pour le dialog de confirmation. */
export function mergeImpact(
  contexts: readonly { readonly tags: readonly string[] }[],
  sources: readonly string[],
  target: string,
): MergeImpact {
  const sourceSet = new Set(sources.filter((source) => source !== target))
  let affectedContexts = 0
  let duplicatesAvoided = 0
  for (const { tags } of contexts) {
    const touched = tags.filter((tag) => sourceSet.has(tag)).length
    if (touched === 0) continue
    affectedContexts += 1
    const occurrencesOfTarget = touched + (tags.includes(target) ? 1 : 0)
    if (occurrencesOfTarget > 1) duplicatesAvoided += 1
  }
  return { affectedContexts, duplicatesAvoided }
}

function similarityKey(name: string): string {
  return name.replace(/[-_.]/g, '').replace(/(?:js|\d+)$/, '')
}

/** Groupes de tags probablement synonymes (« vue », « vue3 », « vuejs »), triés par nom. */
export function findSimilarTags(tags: readonly Tag[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const { name } of tags) {
    const key = similarityKey(name)
    if (key === '') continue
    groups.set(key, [...(groups.get(key) ?? []), name])
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort((a, b) => a.localeCompare(b, 'fr')))
}
