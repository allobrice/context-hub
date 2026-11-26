import type {
  MissionBatch,
  MissionDetail,
  MissionList,
  MissionQueueFilter,
  Priority,
} from '@context-hub/domain/missions/types.ts'

/** Filtres de la file (dans l'URL : `?filter=&tags=&repo=&batch=`). */
export interface MissionListQuery {
  readonly filter: MissionQueueFilter
  /** La mission doit porter TOUS ces tags. */
  readonly tags: readonly string[]
  readonly repo: string | null
  readonly batchId: string | null
}

/** Portée d'une nouvelle mission : `personal` est toujours attribuée à son auteur. */
export type MissionScopeInput =
  | { readonly kind: 'personal' }
  | { readonly kind: 'team'; readonly team: string }
  | { readonly kind: 'project'; readonly repo: string }

/** Création par un humain (« Nouvelle mission ») : prête directement. */
export interface CreateMissionCommand {
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly priority: Priority
  readonly tags: readonly string[]
  readonly scope: MissionScopeInput
  readonly origin: { readonly label: string; readonly batchId: string | null }
  readonly codeRef: {
    readonly repo: string
    readonly commit: string
    readonly files: readonly string[]
  }
  readonly linkedContextIds: readonly string[]
}

/** « Modifier » une mission à valider ou prête ; refusé si elle a changé depuis `expectedUpdatedAt`. */
export interface UpdateMissionCommand {
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly priority: Priority
  readonly tags: readonly string[]
  readonly expectedUpdatedAt: string
}

/**
 * Missions (SPEC §8). Erreurs : `MissionNotFoundError`, `MissionTransitionError` (action refusée par
 * le cycle de vie), `MissionConflictError` (modifiée entre-temps), `MissionRuleError` (gabarit, scan).
 */
export interface MissionRepository {
  list(query: MissionListQuery): Promise<MissionList>
  /** Bloc « Origine » de la file filtrée par lot. */
  batch(batchId: string): Promise<MissionBatch>
  get(slug: string): Promise<MissionDetail>
  create(command: CreateMissionCommand): Promise<MissionDetail>
  update(slug: string, command: UpdateMissionCommand): Promise<MissionDetail>
  validate(slug: string): Promise<MissionDetail>
  /** Rejet d'une mission à valider : elle est supprimée. */
  reject(slug: string, reason: string | null): Promise<void>
  /** Libération forcée d'une mission en cours : elle redevient prête. */
  release(slug: string): Promise<MissionDetail>
  drop(slug: string, reason: string): Promise<MissionDetail>
  reopen(slug: string): Promise<MissionDetail>
}
