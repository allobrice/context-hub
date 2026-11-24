import type {
  CreateWorkspaceCommand,
  EntryQuery,
  WorkspaceListFilter,
  WorkspaceRepository,
} from '../../application/ports/WorkspaceRepository.ts'
import { ContextNotFoundError, WorkspaceNotFoundError } from '@context-hub/domain/shared/errors.ts'
import {
  UI_SESSION_LABEL,
  type AuthoredEntryKind,
  type EntryPage,
  type WorkspaceDetail,
  type WorkspaceEntry,
  type WorkspaceList,
} from '@context-hub/domain/workspaces/types.ts'
import { unwrap, type ApiClient } from './apiClient.ts'
import { toWorkspaceDetail, toWorkspaceList } from './mappers.ts'

/** Le 404 de l'API est générique (`NOT_FOUND`) : pour un workspace, c'est un WorkspaceNotFoundError. */
async function workspaceCall<T>(slug: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw error instanceof ContextNotFoundError ? new WorkspaceNotFoundError(slug) : error
  }
}

export class HttpWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly api: ApiClient) {}

  async list(filter: WorkspaceListFilter): Promise<WorkspaceList> {
    return toWorkspaceList(
      await unwrap(this.api.GET('/api/workspaces', { params: { query: { status: filter } } })),
    )
  }

  get(slug: string): Promise<WorkspaceDetail> {
    return workspaceCall(slug, async () =>
      toWorkspaceDetail(
        await unwrap(this.api.GET('/api/workspaces/{slug}', { params: { path: { slug } } })),
      ),
    )
  }

  async create(command: CreateWorkspaceCommand): Promise<WorkspaceDetail> {
    return toWorkspaceDetail(
      await unwrap(
        this.api.POST('/api/workspaces', {
          body: {
            ...command,
            repos: [...command.repos],
            linkedContextIds: [...command.linkedContextIds],
          },
        }),
      ),
    )
  }

  close(slug: string): Promise<WorkspaceDetail> {
    return workspaceCall(slug, async () =>
      toWorkspaceDetail(
        await unwrap(this.api.POST('/api/workspaces/{slug}/close', { params: { path: { slug } } })),
      ),
    )
  }

  readEntries(slug: string, query: EntryQuery): Promise<EntryPage> {
    return workspaceCall(slug, () =>
      unwrap(this.api.GET('/api/workspaces/{slug}/entries', { params: { path: { slug }, query } })),
    )
  }

  postEntry(
    slug: string,
    entry: { readonly kind: AuthoredEntryKind; readonly body: string },
  ): Promise<WorkspaceEntry> {
    return workspaceCall(slug, () =>
      unwrap(
        this.api.POST('/api/workspaces/{slug}/entries', {
          params: { path: { slug } },
          body: {
            session: UI_SESSION_LABEL,
            repo: null,
            kind: entry.kind,
            body: entry.body,
            files: [],
          },
        }),
      ),
    )
  }

  forceReleaseClaim(slug: string, claimId: string): Promise<void> {
    return workspaceCall(slug, async () => {
      await unwrap(
        this.api.DELETE('/api/workspaces/{slug}/claims/{id}', {
          params: { path: { slug, id: claimId }, query: { force: 'true' } },
        }),
      )
    })
  }
}
