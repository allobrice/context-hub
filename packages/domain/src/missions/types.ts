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
export const DELIVERABLE_KINDS = ['pr', 'commit', 'url'] as const satisfies readonly DeliverableKind[]

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

export type DraftMission = MissionCore & Open & { readonly status: 'draft'; readonly validation: null }

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
  | DraftMission
  | ReadyMission
  | InProgressMission
  | DoneMission
  | DroppedMission
  | ExpiredMission

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
] as const satisfies readonly MissionEventType[]

/** Auteur d'un événement : SPEC §8.1, plus le job de maintenance (expirations). */
export type MissionEventActor = SessionRef | { readonly userId: string } | { readonly system: 'job' }

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
