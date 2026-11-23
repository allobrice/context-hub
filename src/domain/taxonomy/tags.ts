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
  /** Contextes qui portent au moins un des tags fusionnés (ils « reçoivent » le tag cible). */
  readonly affectedContexts: number
  /** Parmi eux, ceux qui sont publiés (lus par les sessions). */
  readonly affectedPublished: number
  /** Contextes qui auraient eu le tag cible en double. */
  readonly duplicatesAvoided: number
}

/** Impact chiffré d'une fusion, pour le dialog de confirmation (maquette 17). */
export function mergeImpact(
  contexts: readonly { readonly tags: readonly string[]; readonly status: string }[],
  sources: readonly string[],
  target: string,
): MergeImpact {
  const sourceSet = new Set(sources.filter((source) => source !== target))
  let affectedContexts = 0
  let affectedPublished = 0
  let duplicatesAvoided = 0
  for (const { tags, status } of contexts) {
    const touched = tags.filter((tag) => sourceSet.has(tag)).length
    if (touched === 0) continue
    affectedContexts += 1
    if (status === 'published') affectedPublished += 1
    const occurrencesOfTarget = touched + (tags.includes(target) ? 1 : 0)
    if (occurrencesOfTarget > 1) duplicatesAvoided += 1
  }
  return { affectedContexts, affectedPublished, duplicatesAvoided }
}

function similarityKey(name: string): string {
  return name.replace(/[-_.]/g, '').replace(/(?:js|\d+)$/, '')
}

/**
 * Cible proposée pour fusionner un groupe de tags proches : le plus utilisé
 * (« vue » pour vue / vue3 / vuejs, maquette 16).
 */
export function preferredMergeTarget(group: readonly Tag[]): Tag | undefined {
  return [...group].sort(
    (a, b) => b.contextCount - a.contextCount || a.name.length - b.name.length,
  )[0]
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

export interface TagSuggestions {
  /** Tags existants correspondant à la saisie, les plus utilisés d'abord. */
  readonly matches: readonly Tag[]
  /** Nom à proposer en création (« Créer le tag « x » »), ou null. */
  readonly creatable: string | null
}

/**
 * Suggestions de la combobox de tags (maquette 12) : les noms qui commencent par la saisie,
 * puis ceux qui la contiennent ; tags déjà choisis exclus.
 */
export function suggestTags(
  tags: readonly Tag[],
  rawQuery: string,
  selected: readonly string[],
  limit = 6,
): TagSuggestions {
  const query = normalizeTagName(rawQuery)
  const available = tags.filter((tag) => !selected.includes(tag.name))
  if (query === '') {
    return {
      matches: [...available].sort((a, b) => b.contextCount - a.contextCount).slice(0, limit),
      creatable: null,
    }
  }
  const rank = (tag: Tag) => (tag.name.startsWith(query) ? 0 : 1)
  const matches = available
    .filter((tag) => tag.name.includes(query))
    .sort(
      (a, b) =>
        rank(a) - rank(b) || b.contextCount - a.contextCount || a.name.localeCompare(b.name, 'fr'),
    )
    .slice(0, limit)
  const exists = tags.some((tag) => tag.name === query) || selected.includes(query)
  return { matches, creatable: !exists && isValidTagName(query) ? query : null }
}
