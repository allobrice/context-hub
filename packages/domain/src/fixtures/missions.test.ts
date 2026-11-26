import { describe, expect, it } from 'vitest'

import { reviewMission } from '../missions/review.ts'
import { countStatuses, toFilterCounts } from '../missions/counts.ts'
import { MissionSchema } from '../schemas/missions.ts'
import { AUDIT_BATCH_ID, MISSION_FIXTURES } from './missions.ts'

describe('fixtures des missions (maquette 31)', () => {
  it('compteurs de la file : 4 à traiter, 1 à valider, 2 prêtes, 2 archivées, 6 en tout', () => {
    const counts = toFilterCounts(countStatuses(MISSION_FIXTURES.map(({ mission }) => mission)))
    expect(counts).toEqual({ todo: 4, to_validate: 1, ready: 2, archived: 2, all: 6 })
  })

  it('un seul lot, et chaque mission est acceptée par les règles du serveur', () => {
    for (const { mission } of MISSION_FIXTURES) {
      expect(mission.origin.batchId).toBe(AUDIT_BATCH_ID)
      const review = reviewMission(
        {
          title: mission.title,
          summary: mission.summary,
          prompt: mission.prompt,
          tags: mission.tags,
          originLabel: mission.origin.label,
          team: mission.scope.kind === 'team' ? mission.scope.team : null,
          codeRef: mission.codeRef,
        },
        'session',
      )
      expect(review.violations, mission.slug).toEqual([])
      expect(() => MissionSchema.parse(mission)).not.toThrow()
    }
  })

  it('le journal de chaque mission commence par sa création et suit l’ordre du temps', () => {
    for (const { mission, events } of MISSION_FIXTURES) {
      expect(events[0]?.type).toBe('created')
      const times = events.map((event) => event.at)
      expect([...times].sort()).toEqual(times)
      expect(events.every((event) => event.missionId === mission.id)).toBe(true)
    }
  })
})
