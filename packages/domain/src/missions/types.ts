/**
 * Missions (SPEC §8.1) : du travail préparé par une session (ou un humain) pour une autre session.
 *
 * ⚠️ Le prompt d'une mission est une INSTRUCTION écrite par un tiers : une session ne l'exécute
 * qu'après l'avoir montré à son utilisateur et obtenu son accord.
 *
 * `Mission` est une union discriminée par `status` : la réservation n'existe qu'en cours, le résultat
 * qu'une fois terminée, la raison d'abandon qu'une fois abandonnée. Les champs restent présents (à
 * `null`) dans les autres statuts : la forme JSON est celle de la SPEC.
 */
import { estimateTokens } from '../context/tokens.ts'
import type { ContextId, Scope } from '../context/types.ts'
import type { Lease } from '../sessions/lease.ts'
import type { SessionRef } from '../sessions/session.ts'

export type MissionStatus = 'draft' | 'ready' | 'in_progress' | 'done' | 'dropped' | 'expired'
export const MISSION_STATUSES = [
  'draft',
  'ready',
  'in_progress',
  'done',
  'dropped',
  'expired',
] as const satisfies readonly MissionStatus[]

export type Priority = 'P1' | 'P2' | 'P3'
/** Ordre de la file : P1 d'abord (l'ordre lexicographique est aussi l'ordre de priorité). */
export const PRIORITIES = ['P1', 'P2', 'P3'] as const satisfies readonly Priority[]

export interface MissionOrigin {
  /** Ex. « Audit perf · page d'accueil Nuxt ». */
  readonly label: string
  /** Lot : les missions issues d'une même analyse. */
  readonly batchId: string | null
  readonly session: SessionRef | null
  readonly createdBy: string
}

export interface CodeRef {
  readonly repo: string
  readonly commit: string
  readonly files: readonly string[]
}

/** Contrôle de fraîcheur rapporté par une session (le serveur n'a pas accès au repo). */
export interface Freshness {
  readonly checkedAt: string
  readonly changedFiles: readonly string[]
  readonly checkedBy: SessionRef
}

export interface Validation {
  readonly by: string
  readonly at: string
}

export interface MissionClaim extends Lease {
  readonly session: SessionRef
}

export type DeliverableKind = 'pr' | 'commit' | 'url'
export const DELIVERABLE_KINDS = [
  'pr',
  'commit',
  'url',
] as const satisfies readonly DeliverableKind[]

export interface Deliverable {
  readonly kind: DeliverableKind
  readonly ref: string
}

export interface Metric {
  readonly name: string
  readonly before: string
  readonly after: string
}

export interface MissionResult {
  readonly summary: string
  readonly deliverables: readonly Deliverable[]
  readonly metrics: readonly Metric[]
  readonly acceptanceMet: boolean
}

/** Champs communs à tous les statuts. */
export interface MissionCore {
  readonly id: string
  readonly slug: string
  readonly title: string
  /** Une ligne, affichée dans la file. */
  readonly summary: string
  /** Markdown autonome, gabarit §8.3. */
  readonly prompt: string
  readonly priority: Priority
  readonly tags: readonly string[]
  readonly scope: Scope
  readonly origin: MissionOrigin
  readonly codeRef: CodeRef
  readonly freshness: Freshness | null
  readonly linkedContextIds: readonly ContextId[]
  readonly workspaceId: string | null
  /**
   * Instruction suspecte détectée par le scan d'une mission créée par un humain : conservée, mais
   * signalée (« Origine et sécurité »). Une session qui en écrit une est refusée. Pas dans la SPEC.
   */
  readonly suspicious: boolean
  readonly createdAt: string
  /** Échéance de la mission tant qu'elle n'est pas prise (14 jours par défaut). */
  readonly expiresAt: string
  /** Dernière écriture : garde de concurrence de « Modifier ». Pas dans le modèle de la SPEC. */
  readonly updatedAt: string
}

interface Open {
  readonly claim: null
  readonly result: null
  readonly dropReason: null
  readonly closedAt: null
}

export type DraftMission = MissionCore &
  Open & { readonly status: 'draft'; readonly validation: null }

export type ReadyMission = MissionCore &
  Open & { readonly status: 'ready'; readonly validation: Validation | null }

export type InProgressMission = MissionCore & {
  readonly status: 'in_progress'
  readonly validation: Validation | null
  readonly claim: MissionClaim
  readonly result: null
  readonly dropReason: null
  readonly closedAt: null
}

export type DoneMission = MissionCore & {
  readonly status: 'done'
  readonly validation: Validation | null
  readonly claim: null
  readonly result: MissionResult
  readonly dropReason: null
  readonly closedAt: string
}

export type DroppedMission = MissionCore & {
  readonly status: 'dropped'
  readonly validation: Validation | null
  readonly claim: null
  readonly result: null
  readonly dropReason: string
  readonly closedAt: string
}

export type ExpiredMission = MissionCore & {
  readonly status: 'expired'
  readonly validation: Validation | null
  readonly claim: null
  readonly result: null
  readonly dropReason: null
  readonly closedAt: string
}

export type Mission =
  DraftMission | ReadyMission | InProgressMission | DoneMission | DroppedMission | ExpiredMission

/**
 * Champs propres à un statut sous forme plate (colonnes SQL, DTO du contrat) : `null` = absent.
 * `missionFromFields` en déduit l'union discriminée.
 */
export interface MissionStatusFields {
  readonly status: MissionStatus
  readonly validation: Validation | null
  readonly claim: MissionClaim | null
  readonly result: MissionResult | null
  readonly dropReason: string | null
  readonly closedAt: string | null
}

/** Mission relue incohérente : un champ requis par son statut manque (donnée corrompue). */
export class InconsistentMissionError extends Error {
  constructor(
    readonly slug: string,
    readonly status: MissionStatus,
    readonly field: 'claim' | 'result' | 'dropReason' | 'closedAt',
  ) {
    super(`Mission ${slug} incohérente : ${field} manquant pour le statut ${status}`)
    this.name = 'InconsistentMissionError'
  }
}

/**
 * Forme plate → union discriminée, seule implémentation (store du serveur, mapper HTTP du front).
 * Les champs propres à un statut sont exigés (réservation en cours ; résultat, raison et date de
 * clôture une fois archivée) ; ceux des autres statuts sont ignorés. Une mission à valider n'a pas
 * de validation. @throws InconsistentMissionError
 */
export function missionFromFields(core: MissionCore, fields: MissionStatusFields): Mission {
  const need = <T>(value: T | null, field: InconsistentMissionError['field']): T => {
    if (value === null) throw new InconsistentMissionError(core.slug, fields.status, field)
    return value
  }
  const { validation } = fields
  const open = { claim: null, result: null, dropReason: null, closedAt: null } as const
  switch (fields.status) {
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
        claim: need(fields.claim, 'claim'),
      }
    case 'done':
      return {
        ...core,
        ...open,
        status: 'done',
        validation,
        result: need(fields.result, 'result'),
        closedAt: need(fields.closedAt, 'closedAt'),
      }
    case 'dropped':
      return {
        ...core,
        ...open,
        status: 'dropped',
        validation,
        dropReason: need(fields.dropReason, 'dropReason'),
        closedAt: need(fields.closedAt, 'closedAt'),
      }
    case 'expired':
      return {
        ...core,
        ...open,
        status: 'expired',
        validation,
        closedAt: need(fields.closedAt, 'closedAt'),
      }
  }
}

/** Qui agit : une session (MCP), un humain (UI) ou le job de maintenance. */
export type MissionActor =
  | { readonly kind: 'session'; readonly session: SessionRef }
  | { readonly kind: 'human'; readonly userId: string }
  | { readonly kind: 'job' }

export type ActorKind = MissionActor['kind']

export type MissionEventType =
  | 'created'
  | 'validated'
  | 'rejected'
  | 'taken'
  | 'released'
  | 'freshness'
  | 'completed'
  | 'dropped'
  | 'expired'
  | 'reopened'
  /** « Modifier » par un humain (à valider ou prête) : détail = champs changés. */
  | 'edited'
export const MISSION_EVENT_TYPES = [
  'created',
  'validated',
  'rejected',
  'taken',
  'released',
  'freshness',
  'completed',
  'dropped',
  'expired',
  'reopened',
  'edited',
] as const satisfies readonly MissionEventType[]

/** Auteur d'un événement : SPEC §8.1, plus le job de maintenance (expirations). */
export type MissionEventActor =
  SessionRef | { readonly userId: string } | { readonly system: 'job' }

/**
 * Événement du cycle de vie (journal append-only). Le slug et le titre sont copiés : un événement
 * reste lisible après la suppression d'une mission rejetée.
 */
export interface MissionEvent {
  readonly missionId: string
  readonly missionSlug: string
  readonly missionTitle: string
  readonly at: string
  readonly actor: MissionEventActor
  readonly type: MissionEventType
  readonly detail: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Une mission non prise expire au bout de 14 jours. */
export const MISSION_EXPIRY_MS = 14 * DAY_MS
/** Une prise dure 30 minutes, prolongée à chaque appel mission de la session. */
export const MISSION_RESERVATION_MINUTES = 30
export const MISSION_PROMPT_MAX_LENGTH = 8_000
export const MISSION_TITLE_MAX_LENGTH = 120
export const MISSION_SUMMARY_MAX_LENGTH = 200
export const MISSION_REASON_MAX_LENGTH = 1_000
export const MISSION_MAX_TAGS = 10
export const MISSION_MAX_FILES = 50
/** Filtres « Archivées » et « Toutes » : seules les N missions closes le plus récemment sont listées. */
export const MISSION_ARCHIVE_LIMIT = 100

// ── File et vues de l'API ────────────────────────────────────────────────────

/** Filtres segmentés de la file (SPEC §8.4) : « À traiter » est aussi le compteur de la sidebar. */
export type MissionQueueFilter = 'todo' | 'to_validate' | 'ready' | 'archived' | 'all'
export const MISSION_QUEUE_FILTERS = [
  'todo',
  'to_validate',
  'ready',
  'archived',
  'all',
] as const satisfies readonly MissionQueueFilter[]

export const MISSION_FILTER_STATUSES: Readonly<
  Record<MissionQueueFilter, readonly MissionStatus[]>
> = {
  todo: ['draft', 'ready', 'in_progress'],
  to_validate: ['draft'],
  ready: ['ready'],
  archived: ['done', 'dropped', 'expired'],
  all: MISSION_STATUSES,
}

export type MissionStatusCounts = Readonly<Record<MissionStatus, number>>
export type MissionFilterCounts = Readonly<Record<MissionQueueFilter, number>>

/** Une ligne de la file : tout sauf le prompt (MCP `mission_list` comme l'UI). */
export type MissionSummary = Omit<Mission, 'prompt'>

export interface MissionList {
  readonly items: readonly MissionSummary[]
  /** Compteurs des filtres segmentés, avec les filtres tags / repo / lot appliqués. */
  readonly counts: MissionFilterCounts
}

/** Contexte lié, publié et visible de l'utilisateur. */
export interface MissionLinkedContext {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly version: number
}

export interface MissionDetail {
  readonly mission: Mission
  /** Estimation (≈ tokens) du prompt. */
  readonly promptTokens: number
  readonly linkedContexts: readonly MissionLinkedContext[]
  /** Journal du cycle de vie, du plus ancien au plus récent. */
  readonly events: readonly MissionEvent[]
}

/** Bloc « Origine » de la file filtrée par lot. */
export interface MissionBatch {
  readonly batchId: string
  readonly label: string
  readonly session: SessionRef | null
  readonly repo: string
  readonly commit: string
  /** Création de la première mission du lot. */
  readonly createdAt: string
  readonly counts: MissionStatusCounts
  readonly total: number
}

/** Ligne de file : la mission sans son prompt (champ par champ, pour ne rien transporter de plus). */
export function toMissionSummary(mission: Mission): MissionSummary {
  return {
    id: mission.id,
    slug: mission.slug,
    title: mission.title,
    summary: mission.summary,
    priority: mission.priority,
    tags: mission.tags,
    scope: mission.scope,
    status: mission.status,
    origin: mission.origin,
    codeRef: mission.codeRef,
    freshness: mission.freshness,
    linkedContextIds: mission.linkedContextIds,
    workspaceId: mission.workspaceId,
    suspicious: mission.suspicious,
    validation: mission.validation,
    claim: mission.claim,
    result: mission.result,
    dropReason: mission.dropReason,
    createdAt: mission.createdAt,
    expiresAt: mission.expiresAt,
    closedAt: mission.closedAt,
    updatedAt: mission.updatedAt,
  }
}

/** Estimation (≈ tokens) affichée avec le prompt rendu. */
export function promptTokens(prompt: string): number {
  return estimateTokens(prompt)
}
