/**
 * Persistance des Missions. Les invariants de concurrence vivent ICI : chaque écriture est UNE
 * transaction verrouillée dès son début (IMMEDIATE en SQLite ; en Postgres, `SELECT … FOR UPDATE`, et
 * `FOR UPDATE SKIP LOCKED` pour `next`) qui lit la mission, applique la `transition` du domaine,
 * écrit la mission et son événement. Deux sessions ne peuvent donc pas prendre la même mission.
 *
 * `take` et `expireDue` commencent par balayer l'échu, dans la même transaction : réservations
 * expirées libérées (événement `released`), missions non prises expirées (événement `expired`). Une
 * mission ne reste jamais bloquée en attendant le job.
 */
import type { MissionCommand, Transition, TransitionError } from '@context-hub/domain/missions/lifecycle.ts'
import type {
  DraftMission,
  InProgressMission,
  Mission,
  MissionActor,
  MissionEvent,
  MissionStatus,
  MissionStatusCounts,
  Priority,
  ReadyMission,
} from '@context-hub/domain/missions/types.ts'
import type { SessionRef } from '@context-hub/domain/sessions/session.ts'

import type { Viewer } from '../viewer.ts'

/** Une mission précise (par slug), ou la prochaine prête qui correspond aux filtres. */
export type TakeTarget =
  | { readonly slug: string }
  | { readonly next: { readonly tags: readonly string[]; readonly repo: string | null } }

export interface TakeWrite {
  readonly viewer: Viewer
  readonly target: TakeTarget
  readonly session: SessionRef
  /** sha-256 du jeton de réservation remis à la session (le jeton n'est jamais stocké). */
  readonly tokenHash: string
  readonly at: Date
}

export type TakeResult =
  | { readonly kind: 'taken'; readonly mission: InProgressMission; readonly event: MissionEvent }
  /** `next` : aucune mission prête ne correspond. */
  | { readonly kind: 'empty' }
  /** Slug inconnu ou hors de la portée du viewer. */
  | { readonly kind: 'not-found' }
  /** La mission existe mais ne peut pas être prise (déjà prise, à valider, terminée…). */
  | { readonly kind: 'refused'; readonly error: TransitionError }

/**
 * Commandes de `apply`. `take` passe par `take` (qui remet le jeton de réservation) ; `expire` et
 * `expireClaim` sont réservées au balayage de l'échu.
 */
export type ApplyCommand = Exclude<
  MissionCommand,
  { readonly type: 'take' | 'expire' | 'expireClaim' }
>

export interface ApplyWrite {
  readonly viewer: Viewer
  readonly slug: string
  readonly command: ApplyCommand
  readonly actor: MissionActor
  /** Exigé quand une session agit sur la mission qu'elle tient ; ignoré sinon. */
  readonly tokenHash: string | null
  readonly at: Date
}

export type ApplyResult =
  | { readonly kind: 'applied'; readonly transition: Transition }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'refused'; readonly error: TransitionError }
  /** La session détentrice n'a pas présenté le bon jeton de réservation. */
  | { readonly kind: 'token-mismatch' }

export interface RenewWrite {
  readonly viewer: Viewer
  readonly slug: string
  readonly session: SessionRef
  readonly tokenHash: string
  readonly at: Date
}

export type RenewResult =
  | { readonly kind: 'renewed'; readonly mission: InProgressMission }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'refused'; readonly error: TransitionError }
  | { readonly kind: 'token-mismatch' }

/** Compteurs du balayage (journalisés par la maintenance). */
export interface SweepResult {
  /** Missions non prises arrivées à échéance. */
  readonly expired: number
  /** Réservations échues libérées. */
  readonly released: number
}

/** Filtres de la file : statuts voulus, et filtres communs aux compteurs (tags, repo, lot). */
export interface MissionQuery {
  readonly statuses: readonly MissionStatus[]
  /** La mission doit porter TOUS ces tags. */
  readonly tags: readonly string[]
  readonly repo: string | null
  readonly batchId: string | null
}

export interface MissionRows {
  /** Missions des statuts voulus, par priorité puis ancienneté. */
  readonly missions: readonly Mission[]
  /** Compteurs par statut, avec les seuls filtres tags / repo / lot. */
  readonly statusCounts: MissionStatusCounts
}

/** Champs modifiables (« Modifier »), déjà relus par `reviewMission`. */
export interface MissionChanges {
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly priority: Priority
  readonly tags: readonly string[]
  readonly suspicious: boolean
}

export interface UpdateWrite {
  readonly viewer: Viewer
  readonly slug: string
  /** `updatedAt` lu par l'appelant : l'écriture est refusée s'il a changé depuis. */
  readonly expectedUpdatedAt: string
  readonly changes: MissionChanges
  readonly at: Date
}

export type UpdateResult =
  | { readonly kind: 'updated'; readonly mission: DraftMission | ReadyMission }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict'; readonly updatedAt: string }
  /** Seules les missions à valider ou prêtes se modifient. */
  | { readonly kind: 'not-editable'; readonly status: MissionStatus }

export interface MissionStore {
  /** @returns false si le slug est déjà pris. */
  create(mission: DraftMission | ReadyMission, event: MissionEvent): Promise<boolean>
  /** Mission visible du viewer (portée), ou null. */
  findBySlug(viewer: Viewer, slug: string): Promise<Mission | null>
  /** File filtrée, avec les compteurs par statut. */
  list(viewer: Viewer, query: MissionQuery): Promise<MissionRows>
  /** Modifie une mission à valider ou prête, si personne ne l'a modifiée depuis. */
  update(write: UpdateWrite): Promise<UpdateResult>
  /** Nom de l'utilisateur, ou null s'il n'existe pas. */
  userName(userId: string): Promise<string | null>
  /** Journal du cycle de vie, dans l'ordre d'écriture. */
  events(missionId: string): Promise<readonly MissionEvent[]>

  take(write: TakeWrite): Promise<TakeResult>
  apply(write: ApplyWrite): Promise<ApplyResult>
  /** Prolonge la réservation de la session détentrice (heartbeat), sans événement. */
  renew(write: RenewWrite): Promise<RenewResult>
  /** Job : libère les réservations échues et expire les missions non prises arrivées à échéance. */
  expireDue(now: Date): Promise<SweepResult>
}
