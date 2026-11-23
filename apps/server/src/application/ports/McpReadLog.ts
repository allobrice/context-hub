import type { ContextId } from '@context-hub/domain/context/types.ts'

import type { UserId } from '../viewer.ts'

export interface McpRead {
  readonly contextId: ContextId
  readonly version: number
  readonly userId: UserId
  readonly at: Date
}

/** Journal des lectures MCP : alimente `mcpReads7d`. Ne contient jamais le contenu lu. */
export interface McpReadLog {
  record(read: McpRead): Promise<void>
}
