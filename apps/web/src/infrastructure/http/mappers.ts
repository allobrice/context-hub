/**
 * Passage des DTO du contrat aux types du domaine. Les formes sont identiques (mêmes schémas Zod
 * côté serveur) ; seul l'identifiant brandé est reconstruit.
 */
import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { toContextId, type Context } from '@context-hub/domain/context/types.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'

import type {
  ContextDetail,
  LibrarySearchResult,
} from '../../application/ports/ContextRepository.ts'
import type { components } from './openapi.d.ts'

type Schemas = components['schemas']

export function toContext(dto: Schemas['Context']): Context {
  return { ...dto, id: toContextId(dto.id) }
}

export function toContextDetail(dto: Schemas['ContextDetail']): ContextDetail {
  return { ...dto, context: toContext(dto.context) }
}

export function toSearchResult(dto: Schemas['LibrarySearchResult']): LibrarySearchResult {
  return { ...dto, page: { ...dto.page, items: dto.page.items.map(toContext) } }
}

/** `system` n'est présent que pour « Sans collection » (exactOptionalPropertyTypes). */
export function toCollection({ system, ...rest }: Schemas['Collection']): Collection {
  return system === true ? { ...rest, system } : rest
}

/** Corps d'un brouillon : le contrat attend des tableaux modifiables. */
export function toDraftBody(draft: ContextDraftInput): Schemas['ContextDraftInput'] {
  return { ...draft, tags: [...draft.tags] }
}
