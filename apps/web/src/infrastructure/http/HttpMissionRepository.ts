import {
  MissionBatchNotFoundError,
  MissionNotFoundError,
} from '@context-hub/domain/missions/errors.ts'
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

/** Le 404 de l'API est générique (`NOT_FOUND`) : pour une mission, c'est un MissionNotFoundError. */
async function missionCall<T>(slug: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof ContextNotFoundError) throw new MissionNotFoundError(slug)
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

  async batch(batchId: string): Promise<MissionBatch> {
    try {
      return await unwrap(
        this.api.GET('/api/missions/batches/{id}', { params: { path: { id: batchId } } }),
      )
    } catch (error) {
      if (error instanceof ContextNotFoundError) throw new MissionBatchNotFoundError(batchId)
      throw error
    }
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

  validate(slug: string, expectedUpdatedAt?: string): Promise<MissionDetail> {
    return this.guardedAction(slug, 'validate', expectedUpdatedAt)
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

  release(slug: string, expectedUpdatedAt?: string): Promise<MissionDetail> {
    return this.guardedAction(slug, 'release', expectedUpdatedAt)
  }

  drop(slug: string, reason: string, expectedUpdatedAt?: string): Promise<MissionDetail> {
    return missionCall(slug, async () =>
      toMissionDetail(
        await unwrap(
          this.api.POST('/api/missions/{slug}/drop', {
            params: { path: { slug } },
            body: { reason, ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }) },
          }),
        ),
      ),
    )
  }

  reopen(slug: string): Promise<MissionDetail> {
    return this.action(slug, 'reopen')
  }

  private action(slug: string, action: 'reopen'): Promise<MissionDetail> {
    const path = { reopen: '/api/missions/{slug}/reopen' } as const
    return missionCall(slug, async () =>
      toMissionDetail(await unwrap(this.api.POST(path[action], { params: { path: { slug } } }))),
    )
  }

  private guardedAction(
    slug: string,
    action: 'validate' | 'release',
    expectedUpdatedAt: string | undefined,
  ): Promise<MissionDetail> {
    const path = {
      validate: '/api/missions/{slug}/validate',
      release: '/api/missions/{slug}/release',
    } as const
    return missionCall(slug, async () =>
      toMissionDetail(
        await unwrap(
          this.api.POST(path[action], {
            params: { path: { slug } },
            body: expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt },
          }),
        ),
      ),
    )
  }
}
