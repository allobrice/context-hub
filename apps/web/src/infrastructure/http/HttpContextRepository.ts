import type { ContextId } from '@context-hub/domain/context/types.ts'
import type { LibraryCriteria } from '@context-hub/domain/library/criteria.ts'

import type {
  ContextDetail,
  ContextRepository,
  LibrarySearchResult,
  SaveDraftCommand,
} from '../../application/ports/ContextRepository.ts'
import { unwrap, type ApiClient } from './apiClient.ts'
import { toContextDetail, toDraftBody, toSearchResult } from './mappers.ts'

/** Contextes servis par l'API REST. Le serveur fait autorité (portées, scan, conflits). */
export class HttpContextRepository implements ContextRepository {
  constructor(private readonly api: ApiClient) {}

  async search(criteria: LibraryCriteria): Promise<LibrarySearchResult> {
    const query = {
      query: criteria.query,
      tags: [...criteria.tags],
      sort: criteria.sort,
      page: criteria.page,
      ...(criteria.collectionId === null ? {} : { collection: criteria.collectionId }),
      ...(criteria.scope === null ? {} : { scope: criteria.scope }),
      ...(criteria.status === null ? {} : { status: criteria.status }),
    }
    return toSearchResult(await unwrap(this.api.GET('/api/contexts', { params: { query } })))
  }

  async get(reference: string): Promise<ContextDetail> {
    const params = { path: { id: reference } }
    return toContextDetail(await unwrap(this.api.GET('/api/contexts/{id}', { params })))
  }

  async archive(id: ContextId): Promise<ContextDetail> {
    const params = { path: { id } }
    return toContextDetail(await unwrap(this.api.POST('/api/contexts/{id}/archive', { params })))
  }

  async unarchive(id: ContextId): Promise<ContextDetail> {
    const params = { path: { id } }
    return toContextDetail(await unwrap(this.api.POST('/api/contexts/{id}/unarchive', { params })))
  }

  async restoreVersion(id: ContextId, versionNumber: number): Promise<ContextDetail> {
    const params = { path: { id, n: versionNumber } }
    return toContextDetail(
      await unwrap(this.api.POST('/api/contexts/{id}/versions/{n}/restore', { params })),
    )
  }

  /** Création (POST) ou brouillon au-dessus de `baseVersion` (PUT, 409 si une version est passée). */
  async saveDraft({ id, baseVersion, draft }: SaveDraftCommand): Promise<ContextDetail> {
    if (id === null) {
      return toContextDetail(
        await unwrap(this.api.POST('/api/contexts', { body: toDraftBody(draft) })),
      )
    }
    const params = { path: { id } }
    return toContextDetail(
      await unwrap(
        this.api.PUT('/api/contexts/{id}/draft', {
          params,
          body: { baseVersion, draft: toDraftBody(draft) },
        }),
      ),
    )
  }

  /**
   * Enregistre puis publie : le serveur rescanne le contenu (422 avec les findings si un secret
   * reste) et revérifie la version de base (409).
   */
  async publish(command: SaveDraftCommand): Promise<ContextDetail> {
    const saved = await this.saveDraft(command)
    const params = { path: { id: saved.context.id } }
    const body = {
      baseVersion: command.baseVersion,
      note: command.draft.versionNote,
      falsePositives: [...command.falsePositives],
    }
    return toContextDetail(
      await unwrap(this.api.POST('/api/contexts/{id}/publish', { params, body })),
    )
  }
}
