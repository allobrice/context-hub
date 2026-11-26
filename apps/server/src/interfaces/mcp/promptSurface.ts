/**
 * Modèles réutilisables (SPEC §8.5) : les contextes publiés marqués `exposeAsPrompt` sont servis
 * comme prompts MCP (`prompts/list`, `prompts/get`). Claude Code les affiche comme slash commands
 * `/mcp__context-hub__<nom>`.
 *
 * Un prompt est déclenché par l'HUMAIN (jamais par l'agent) : c'est un confort, pas un canal de
 * mission. La liste est recalculée à chaque appel (portées du viewer, valeurs PUBLIÉES), et
 * `notifications/prompts/list_changed` est relayé à chaque publication, archivage ou désarchivage.
 * Journal : nom du prompt et utilisateur ; jamais le contenu.
 */
import { ProtocolError, ProtocolErrorCode, type McpServer } from '@modelcontextprotocol/server'

import type { ContextCatalog } from '../../application/mcp/ContextCatalog.ts'
import type { Logger } from '../../application/ports/Logger.ts'
import type { Viewer } from '../../application/viewer.ts'

export interface PromptSurfaceDependencies {
  readonly catalog: ContextCatalog
  readonly logger: Logger
}

export function registerPromptSurface(
  server: McpServer,
  { catalog, logger }: PromptSurfaceDependencies,
  viewer: Viewer,
): void {
  server.server.registerCapabilities({ prompts: { listChanged: true } })

  server.server.setRequestHandler('prompts/list', async () => {
    const { prompts, shadowed } = await catalog.listPrompts(viewer)
    // Deux slugs qui donnent le même nom (« a/b » et « a-b ») : le second n'est pas exposé.
    if (shadowed.length > 0) {
      logger.info('mcp.prompt_name_collision', { count: shadowed.length, user: viewer.userId })
    }
    return {
      prompts: prompts.map(({ name, summary }) => ({
        name,
        title: summary.title,
        description: `${summary.description} (modèle Context Hub, v${String(summary.version)})`,
      })),
    }
  })

  server.server.setRequestHandler('prompts/get', async (request) => {
    const { name } = request.params
    const read = await catalog.readPrompt(viewer, name)
    if (read === null) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Prompt inconnu : ${name}`)
    }
    logger.info('mcp.prompt_get', { prompt: name, user: viewer.userId })
    return {
      description: `${read.summary.title} (v${String(read.version.number)})`,
      messages: [{ role: 'user', content: { type: 'text', text: read.version.content } }],
    }
  })
}
