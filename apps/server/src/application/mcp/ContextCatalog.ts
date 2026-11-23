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
 * - seuls les contextes au statut `published` sont servis : jamais un brouillon ni un archivé,
 *   et seulement leurs métadonnées publiées (titre, description, tags, portée) ;
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
    // Métadonnées et portée PUBLIÉES : un brouillon en cours n'a aucun effet sur ce qui est servi.
    const published = await this.store.findPublished(viewer, slug)
    if (!published) return null
    const { summary, history } = published
    const servedNumber = version ?? summary.version
    const served = history.find((item) => item.number === servedNumber)
    if (!served) return null
    await this.reads.record({
      contextId: summary.id,
      version: served.number,
      userId: viewer.userId,
      at: this.clock.now(),
    })
    return { summary, version: served }
  }
}
