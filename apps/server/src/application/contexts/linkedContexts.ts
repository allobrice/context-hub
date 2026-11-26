/**
 * Contextes liés à un workspace ou à une mission : vérification à l'écriture, résolution au détail.
 * Une seule lecture ciblée (`findPublishedByIds`), jamais la bibliothèque entière.
 */
import type { ContextId } from '@context-hub/domain/context/types.ts'

import type { ContextStore } from '../ports/ContextStore.ts'
import type { Viewer } from '../viewer.ts'

/** Contexte lié tel qu'affiché : version publiée courante. */
export interface LinkedContextRef {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly version: number
}

type PublishedLookup = Pick<ContextStore, 'findPublishedByIds'>

/**
 * Identifiants à enregistrer, sans doublon et dans l'ordre demandé ; null si l'un n'est pas un
 * contexte publié visible du `viewer` (l'appelant lève son erreur de règle).
 */
export async function checkLinkedContexts(
  store: PublishedLookup,
  viewer: Viewer,
  ids: readonly string[],
): Promise<ContextId[] | null> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const published = new Map<string, ContextId>(
    (await store.findPublishedByIds(viewer, unique)).map(({ id }) => [id, id]),
  )
  const checked = unique.flatMap((id) => {
    const contextId = published.get(id)
    return contextId === undefined ? [] : [contextId]
  })
  return checked.length === unique.length ? checked : null
}

/**
 * Contextes liés encore publiés et visibles, dans l'ordre enregistré : un contexte archivé ou
 * devenu hors de portée disparaît du détail.
 */
export async function resolveLinkedContexts(
  store: PublishedLookup,
  viewer: Viewer,
  ids: readonly string[],
): Promise<LinkedContextRef[]> {
  if (ids.length === 0) return []
  const published = new Map<string, LinkedContextRef>(
    (await store.findPublishedByIds(viewer, ids)).map(({ id, slug, title, version }) => [
      id,
      { id, slug, title, version },
    ]),
  )
  return ids.flatMap((id) => {
    const context = published.get(id)
    return context ? [context] : []
  })
}
