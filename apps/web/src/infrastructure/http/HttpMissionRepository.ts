import { MissionNotFoundError } from '@context-hub/domain/missions/errors.ts'
import { MissionConflictError } from '@context-hub/domain/missions/errors.ts'
import type {
  MissionBatch,
  MissionDetail,
  MissionList,
} from '@context-hub/domain/missions/types.ts'
import { ContextNotFoundError } from '@context-hub/domain/shared/errors.ts'

import type {
  CreateMissionCommand,
  MissionListQuery,
  MissionRepository,
  UpdateMissionCommand,
} from '../../application/ports/MissionRepository.ts'
import { unwrap, type ApiClient } from './apiClient.ts'
import { toMissionDetail, toMissionList } from './mappers.ts'

/**
 * Le 404 de l'API est générique (`NOT_FOUND`) : pour une mission, c'est un MissionNotFoundError ; un
 * conflit de modification porte le slug de la mission.
 */
async function missionCall<T>(slug: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof ContextNotFoundError) throw new MissionNotFoundError(slug)
    if (error instanceof MissionConflictError) throw new MissionConflictError(slug, error.updatedAt)
    throw error
  }
}

export class HttpMissionRepository implements MissionRepository {
  constructor(private readonly api: ApiClient) {}

  async list(query: MissionListQuery): Promise<MissionList> {
    return toMissionList(
      await unwrap(
        this.api.GET('/api/missions', {
          params: {
            query: {
              filter: query.filter,
              ...(query.tags.length > 0 ? { tags: query.tags.join(',') } : {}),
              ...(query.repo === null ? {} : { repo: query.repo }),
              ...(query.batchId === null ? {} : { batch: query.batchId }),
            },
          },
        }),
      ),
    )
  }

  batch(batchId: string): Promise<MissionBatch> {
    return missionCall(batchId, () =>
      unwrap(this.api.GET('/api/missions/batches/{id}', { params: { path: { id: batchId } } })),
    )
  }

  get(slug: string): Promise<MissionDetail> {
    return missionCall(slug, async () =>
      toMissionDetail(
        await unwrap(this.api.GET('/api/missions/{slug}', { params: { path: { slug } } })),
      ),
    )
  }

  async create(command: CreateMissionCommand): Promise<MissionDetail> {
    return toMissionDetail(
      await unwrap(
        this.api.POST('/api/missions', {
          body: {
            ...command,
            tags: [...command.tags],
            codeRef: { ...command.codeRef, files: [...command.codeRef.files] },
            linkedContextIds: [...command.linkedContextIds],
          },
        }),
      ),
    )
  }

  update(slug: string, command: UpdateMissionCommand): Promise<MissionDetail> {
    return missionCall(slug, async () =>
      toMissionDetail(
        await unwrap(
          this.api.PATCH('/api/missions/{slug}', {
            params: { path: { slug } },
            body: { ...command, tags: [...command.tags] },
          }),
        ),
      ),
    )
  }

  validate(slug: string): Promise<MissionDetail> {
    return this.action(slug, 'validate')
  }

  async reject(slug: string, reason: string | null): Promise<void> {
    await missionCall(slug, () =>
      unwrap(
        this.api.POST('/api/missions/{slug}/reject', {
          params: { path: { slug } },
          body: { reason },
        }),
      ),
    )
  }

  release(slug: string): Promise<MissionDetail> {
    return this.action(slug, 'release')
  }

  drop(slug: string, reason: string): Promise<MissionDetail> {
    return missionCall(slug, async () =>
      toMissionDetail(
        await unwrap(
          this.api.POST('/api/missions/{slug}/drop', {
            params: { path: { slug } },
            body: { reason },
          }),
        ),
      ),
    )
  }

  reopen(slug: string): Promise<MissionDetail> {
    return this.action(slug, 'reopen')
  }

  private action(slug: string, action: 'validate' | 'release' | 'reopen'): Promise<MissionDetail> {
    const path = {
      validate: '/api/missions/{slug}/validate',
      release: '/api/missions/{slug}/release',
      reopen: '/api/missions/{slug}/reopen',
    } as const
    return missionCall(slug, async () =>
      toMissionDetail(await unwrap(this.api.POST(path[action], { params: { path: { slug } } }))),
    )
  }
}
