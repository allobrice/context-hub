/** Support de test des Missions : données d'une nouvelle mission, sessions et horloge. */
import { createMission, type NewMission } from '@context-hub/domain/missions/lifecycle.ts'
import type { DraftMission, MissionEvent, ReadyMission } from '@context-hub/domain/missions/types.ts'
import type { SessionRef } from '@context-hub/domain/sessions/session.ts'

export const MISSION_NOW = new Date('2026-11-25T10:00:00.000Z')

export function sessionRef(sessionLabel: string, userId = 'brice'): SessionRef {
  return {
    userId,
    userName: userId === 'brice' ? 'Brice' : 'Camille',
    sessionLabel,
    repo: 'allovoisins/front',
  }
}

export const PROMPT = [
  '## Objectif',
  'Réduire le LCP de la home.',
  '## Constat',
  'LCP 4,1 s le 2026-11-24 sur abc1234.',
  '## Fichiers',
  '- app/pages/index.vue',
  '## À faire',
  'Précharger l’image héro.',
  "## Critères d'acceptation",
  'LCP < 2,5 s.',
].join('\n')

export function newMission(slug: string, overrides: Partial<NewMission> = {}): NewMission {
  return {
    id: `mission-${slug}`,
    slug,
    title: `Mission ${slug}`,
    summary: 'Une ligne de résumé.',
    prompt: PROMPT,
    priority: 'P2',
    tags: ['perf'],
    scope: { kind: 'team', team: 'allovoisins' },
    origin: {
      label: 'Audit perf · page d’accueil Nuxt',
      batchId: 'batch-perf',
      session: sessionRef('audit-1'),
      createdBy: 'brice',
    },
    codeRef: { repo: 'allovoisins/front', commit: 'abc1234', files: ['app/pages/index.vue'] },
    freshness: null,
    linkedContextIds: [],
    workspaceId: null,
    ...overrides,
  }
}

/** Mission prête (créée par un humain), avec son événement de création. */
export function readyMission(
  slug: string,
  overrides: Partial<NewMission> = {},
  now: Date = MISSION_NOW,
): { readonly mission: DraftMission | ReadyMission; readonly event: MissionEvent } {
  return createMission(newMission(slug, overrides), { kind: 'human', userId: 'brice' }, now)
}
