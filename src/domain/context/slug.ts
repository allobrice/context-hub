import type { Context, Slug } from './types.ts'

const SLUG_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'
const SLUG_PATTERN = new RegExp(`^${SLUG_SEGMENT}(?:/${SLUG_SEGMENT})*$`)

/** « Conventions Nuxt 4 — composables & auto-imports » → « conventions-nuxt-4-composables-auto-imports ». */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface SlugSource {
  readonly title: string
  /** Nom de la collection, ou null pour « Sans collection ». */
  readonly collectionName: string | null
}

/** Slug proposé depuis le titre, préfixé par la collection : « nuxt/conventions-nuxt-4 ». */
export function generateSlug({ title, collectionName }: SlugSource): Slug {
  const leaf = slugify(title)
  const prefix = collectionName === null ? '' : slugify(collectionName)
  if (prefix === '') return leaf
  if (leaf === '') return prefix
  return `${prefix}/${leaf}`
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

/** L'identifiant n'est modifiable qu'avant la première publication (v1). */
export function isSlugEditable(context: Pick<Context, 'publishedVersion'> | null): boolean {
  return context?.publishedVersion == null
}
