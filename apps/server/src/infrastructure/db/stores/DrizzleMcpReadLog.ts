import type { McpRead, McpReadLog } from '../../../application/ports/McpReadLog.ts'
import type { AppDatabase } from '../connection.ts'
import { deferred } from '../deferred.ts'
import { isoDate } from '../dates.ts'
import { mcpReads } from '../schema.ts'

export class DrizzleMcpReadLog implements McpReadLog {
  constructor(private readonly db: AppDatabase) {}

  record({ contextId, version, userId, at }: McpRead): Promise<void> {
    return deferred(() => {
      this.db
        .insert(mcpReads)
        .values({ contextId, version, userId, at: isoDate(at) })
        .run()
    })
  }
}
