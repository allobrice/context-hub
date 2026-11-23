import { isValidSlug } from '@context-hub/domain/context/slug.ts'
import type { ContextVersion } from '@context-hub/domain/context/types.ts'

import type { Clock } from '../ports/Clock.ts'
import type { ContextStore, PublishedSearch, PublishedSummary } from '../ports/ContextStore.ts'
import type { McpReadLog } from '../ports/McpReadLog.ts'
import type { Viewer } from '../viewer.ts'

export interface PublishedRead {
  readonly summary: PublishedSummary
  readonly version: ContextVersion
}

/**
 * Lecture des contextes par les sessions MCP. Règles de sécurité :
 * - seuls les contextes au statut `published` sont servis : jamais un brouillon ni un archivé ;
 * - une version figée n'est servie que parmi les versions publiées (immuables) ;
 * - les portées du `viewer` s'appliquent (un `personal` d'un autre est introuvable) ;
 * - chaque lecture de contenu est journalisée dans `mcp_reads` (sans le contenu).
 */
export class ContextCatalog {
  constructor(
    private readonly store: ContextStore,
    private readonly reads: McpReadLog,
    private readonly clock: Clock,
  ) {}

  listPublished(viewer: Viewer): Promise<readonly PublishedSummary[]> {
    return this.store.listPublished(viewer)
  }

  search(viewer: Viewer, search: PublishedSearch): Promise<readonly PublishedSummary[]> {
    return this.store.searchPublished(viewer, search)
  }

  /** Version publiée courante (version null) ou figée ; null si introuvable ou non servie. */
  async read(viewer: Viewer, slug: string, version: number | null): Promise<PublishedRead | null> {
    if (!isValidSlug(slug)) return null
    const detail = await this.store.find(viewer, slug)
    // `find` accepte aussi un identifiant : seule une URI par slug est servie.
    if (detail?.context.slug !== slug || detail.context.status !== 'published') return null
    const published = detail.context.publishedVersion
    if (!published) return null
    const served =
      version === null ? published : detail.history.find((item) => item.number === version)
    if (!served) return null
    const { context } = detail
    await this.reads.record({
      contextId: context.id,
      version: served.number,
      userId: viewer.userId,
      at: this.clock.now(),
    })
    return {
      summary: {
        id: context.id,
        slug: context.slug,
        title: context.title,
        description: context.description,
        scope: context.scope,
        version: published.number,
        tokenEstimate: published.tokenEstimate,
      },
      version: served,
    }
  }
}
