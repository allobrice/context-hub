import { describe, expect, it } from 'vitest'

import { runMaintenance } from './maintenance.ts'
import type { LogFields, Logger } from './ports/Logger.ts'

function recordingLogger(): Logger & { readonly events: [string, LogFields | undefined][] } {
  const events: [string, LogFields | undefined][] = []
  return {
    events,
    info: (event, fields) => events.push([event, fields]),
    error: (event, fields) => events.push([event, fields]),
  }
}

describe('runMaintenance', () => {
  it('journalise chaque tâche sous son nom, et une tâche en échec n’arrête pas les suivantes', async () => {
    const logger = recordingLogger()
    await runMaintenance(
      [
        { name: 'workspaces', run: () => Promise.reject(new TypeError('boom')) },
        { name: 'missions', run: () => Promise.resolve({ expired: 2 }) },
      ],
      logger,
    )
    expect(logger.events).toEqual([
      ['workspaces.maintenance_failed', { error: 'TypeError' }],
      ['missions.maintenance', { expired: 2 }],
    ])
  })
})
