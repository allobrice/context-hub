import { DEMO_NOW } from '@context-hub/domain/fixtures/now.ts'

import type { Clock } from '../../application/ports/Clock.ts'

/** Horloge figée sur DEMO_NOW : les dates relatives des maquettes restent exactes. */
export const demoClock: Clock = { now: () => new Date(DEMO_NOW) }
