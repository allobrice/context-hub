/**
 * Passage des DTO du contrat aux types du domaine. Les formes sont identiques (mêmes schémas Zod
 * côté serveur) ; seul l'identifiant brandé est reconstruit.
 */
import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { toContextId, type Context } from '@context-hub/domain/context/types.ts'
import {
  toMissionSummary,
  type Mission,
  type MissionDetail,
  type MissionList,
} from '@context-hub/domain/missions/types.ts'
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

// ── Missions ────────────────────────────────────────────────────────────────

/** Champ obligatoire pour ce statut : son absence est une réponse incohérente du serveur. */
function required<T>(value: T | null, field: string, slug: string): T {
  if (value === null) throw new Error(`Mission ${slug} incohérente : ${field} manquant`)
  return value
}

/**
 * Forme plate du contrat → union discriminée du domaine : les champs propres à un statut sont
 * vérifiés (réservation en cours, résultat terminé, raison abandonnée, date de clôture).
 */
export function toMission(dto: Schemas['Mission']): Mission {
  const { claim, result, dropReason, closedAt, validation, ...rest } = dto
  const core = { ...rest, linkedContextIds: dto.linkedContextIds.map(toContextId) }
  const open = { claim: null, result: null, dropReason: null, closedAt: null } as const
  switch (dto.status) {
    case 'draft':
      return { ...core, ...open, status: 'draft', validation: null }
    case 'ready':
      return { ...core, ...open, status: 'ready', validation }
    case 'in_progress':
      return {
        ...core,
        ...open,
        status: 'in_progress',
        validation,
        claim: required(claim, 'claim', dto.slug),
      }
    case 'done':
      return {
        ...core,
        ...open,
        status: 'done',
        validation,
        result: required(result, 'result', dto.slug),
        closedAt: required(closedAt, 'closedAt', dto.slug),
      }
    case 'dropped':
      return {
        ...core,
        ...open,
        status: 'dropped',
        validation,
        dropReason: required(dropReason, 'dropReason', dto.slug),
        closedAt: required(closedAt, 'closedAt', dto.slug),
      }
    case 'expired':
      return {
        ...core,
        ...open,
        status: 'expired',
        validation,
        closedAt: required(closedAt, 'closedAt', dto.slug),
      }
  }
}

export function toMissionDetail(dto: Schemas['MissionDetail']): MissionDetail {
  return { ...dto, mission: toMission(dto.mission) }
}

export function toMissionList(dto: Schemas['MissionList']): MissionList {
  return {
    ...dto,
    items: dto.items.map((item) => toMissionSummary(toMission({ ...item, prompt: '' }))),
  }
}
