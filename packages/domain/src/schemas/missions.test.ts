import { describe, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'

import type { Mission, MissionEvent, MissionResult } from '../missions/types.ts'
import type { MissionEventSchema, MissionResultSchema, MissionSchema } from './missions.ts'

describe('schémas des missions', () => {
  it('acceptent les types du domaine (typecheck)', () => {
    expectTypeOf<Mission>().toExtend<z.input<typeof MissionSchema>>()
    expectTypeOf<MissionEvent>().toExtend<z.input<typeof MissionEventSchema>>()
    expectTypeOf<MissionResult>().toExtend<z.input<typeof MissionResultSchema>>()
  })
})
