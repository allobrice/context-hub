import { isValidSlug } from '@context-hub/domain/context/slug.ts'
import { promptName } from '@context-hub/domain/context/uri.ts'
import type { ContextVersion } from '@context-hub/domain/context/types.ts'

import type { Clock } from '../ports/Clock.ts'
import type { ContextStore, PublishedSearch, PublishedSummary } from '../ports/ContextStore.ts'
import type { McpReadLog } from '../ports/McpReadLog.ts'
import type { Viewer } from '../viewer.ts'

export interface PromptEntry {
  /** Nom du prompt MCP (unique dans la liste). */
  readonly name: string
  readonly summary: PublishedSummary
}

export interface PromptList {
  readonly prompts: readonly PromptEntry[]
  /** Slugs non exposés parce qu'un autre contexte donne déjà le même nom de prompt. */
  readonly shadowed: readonly string[]
}

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

  /**
   * Contextes publiés et visibles marqués `exposeAsPrompt` (valeur PUBLIÉE), par slug. Deux slugs qui
   * donneraient le même nom : le premier seul est exposé.
   */
  async listPrompts(viewer: Viewer): Promise<PromptList> {
    const byName = new Map<string, PromptEntry>()
    const shadowed: string[] = []
    for (const summary of await this.store.listPublished(viewer)) {
      if (!summary.exposeAsPrompt) continue
      const name = promptName(summary)
      if (byName.has(name)) shadowed.push(summary.slug)
      else byName.set(name, { name, summary })
    }
    return { prompts: [...byName.values()], shadowed }
  }

  /** Contenu publié d'un prompt, journalisé comme une lecture ; null s'il n'est pas exposé. */
  async readPrompt(viewer: Viewer, name: string): Promise<PublishedRead | null> {
    const { prompts } = await this.listPrompts(viewer)
    const entry = prompts.find((prompt) => prompt.name === name)
    return entry === undefined ? null : this.read(viewer, entry.summary.slug, null)
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
