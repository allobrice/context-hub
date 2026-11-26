/**
 * Passage des DTO du contrat aux types du domaine. Les formes sont identiques (mêmes schémas Zod
 * côté serveur) ; seul l'identifiant brandé est reconstruit.
 */
import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { toContextId, type Context } from '@context-hub/domain/context/types.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'
import type {
  Claim,
  Workspace,
  WorkspaceDetail,
  WorkspaceList,
} from '@context-hub/domain/workspaces/types.ts'

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
export function toDraftBody({
  exposeAsPrompt,
  ...draft
}: ContextDraftInput): Schemas['ContextDraftInput'] {
  const body = { ...draft, tags: [...draft.tags] }
  // Absent : le serveur conserve le marquage courant (exactOptionalPropertyTypes : pas d'undefined).
  return exposeAsPrompt === undefined ? body : { ...body, exposeAsPrompt }
}

export function toWorkspace(dto: Schemas['Workspace']): Workspace {
  return { ...dto, linkedContextIds: dto.linkedContextIds.map(toContextId) }
}

export function toWorkspaceList(dto: Schemas['WorkspaceList']): WorkspaceList {
  return {
    ...dto,
    items: dto.items.map((item) => ({ ...item, workspace: toWorkspace(item.workspace) })),
  }
}

export function toWorkspaceDetail(dto: Schemas['WorkspaceDetail']): WorkspaceDetail {
  return { ...dto, workspace: toWorkspace(dto.workspace) }
}

export function toClaim(dto: Schemas['Claim']): Claim {
  return dto
}
