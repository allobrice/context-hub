import type { Collection } from '../../../domain/taxonomy/types.ts'
import { listedVersion, scopeTarget, type Context } from '../../../domain/context/types.ts'
import { formatTokensCompact } from '../../lib/format.ts'
import { SCOPE_LABELS } from '../../lib/labels.ts'

/** Données d'affichage d'un contexte dans les listes (tableau et cartes). */
export interface ContextListing {
  readonly collectionName: string
  readonly scopeLabel: string
  readonly scopeTarget: string
  /** « v4 », ou chaîne vide si aucune version. */
  readonly version: string
  /** « 2,1k », ou chaîne vide. */
  readonly tokens: string
}

export function presentContext(
  context: Context,
  collectionsById: ReadonlyMap<string, Collection>,
): ContextListing {
  const version = listedVersion(context)
  return {
    collectionName:
      context.collectionId === null
        ? 'Sans collection'
        : (collectionsById.get(context.collectionId)?.name ?? '—'),
    scopeLabel: SCOPE_LABELS[context.scope.kind],
    scopeTarget: scopeTarget(context.scope),
    version: version ? `v${version.number}` : '',
    tokens: version ? formatTokensCompact(version.tokenEstimate) : '',
  }
}
