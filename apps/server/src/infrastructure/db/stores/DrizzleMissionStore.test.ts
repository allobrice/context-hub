import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createMission } from '@context-hub/domain/missions/lifecycle.ts'
import type { MissionResult } from '@context-hub/domain/missions/types.ts'

import type { ApplyResult, TakeResult } from '../../../application/ports/MissionStore.ts'
import { MISSION_NOW, newMission, readyMission, sessionRef } from '../../../test/missionFixtures.ts'
import {
  BRICE,
  CAMILLE,
  createTestDatabase,
  type TestDatabase,
} from '../../../test/testDatabase.ts'
import { missionTags } from '../schema.ts'
import { DrizzleMissionStore } from './DrizzleMissionStore.ts'

const MINUTE = 60 * 1000
const later = (minutes: number) => new Date(MINUTE_NOW + minutes * MINUTE)
const MINUTE_NOW = MISSION_NOW.getTime()
const WEB_1 = sessionRef('web-1')
const WEB_2 = sessionRef('web-2')
const RESULT: MissionResult = {
  summary: 'Image héro préchargée.',
  deliverables: [{ kind: 'pr', ref: 'allovoisins/front#42' }],
  metrics: [{ name: 'LCP', before: '4,1 s', after: '2,2 s' }],
  acceptanceMet: true,
}

let database: TestDatabase
let store: DrizzleMissionStore

beforeEach(() => {
  database = createTestDatabase({ demoMissions: false })
  store = new DrizzleMissionStore(database.db)
})

afterEach(() => {
  database.close()
})

async function seed(
  slug: string,
  overrides: Parameters<typeof newMission>[1] = {},
  now = MISSION_NOW,
) {
  const { mission, event } = readyMission(slug, overrides, now)
  expect(await store.create(mission, event)).toBe(true)
  return mission
}

function takeSlug(
  slug: string,
  session = WEB_1,
  at = MISSION_NOW,
  tokenHash = `hash-${session.sessionLabel}`,
) {
  return store.take({ viewer: BRICE, target: { slug }, session, tokenHash, at })
}

function takeNext(tags: readonly string[] = [], repo: string | null = null, at = MISSION_NOW) {
  return store.take({
    viewer: BRICE,
    target: { next: { tags, repo } },
    session: WEB_1,
    tokenHash: 'hash-web-1',
    at,
  })
}

function takenSlug(result: TakeResult): string {
  if (result.kind !== 'taken') throw new Error(`prise attendue, obtenu ${result.kind}`)
  return result.mission.slug
}

function appliedStatus(result: ApplyResult): string {
  if (result.kind !== 'applied') throw new Error(`transition attendue, obtenu ${result.kind}`)
  return result.transition.kind === 'deleted' ? 'deleted' : result.transition.mission.status
}

describe('DrizzleMissionStore : création et lecture', () => {
  it('relit la mission telle qu’écrite (tags ordonnés, origine avec le nom de la session)', async () => {
    const mission = await seed('lcp-home', { tags: ['perf', 'home', 'lcp'] })
    expect(await store.findBySlug(BRICE, 'lcp-home')).toEqual(mission)
  })

  it('refuse un slug déjà pris', async () => {
    await seed('lcp-home')
    const { mission, event } = readyMission('lcp-home', { id: 'other-id' })
    expect(await store.create(mission, event)).toBe(false)
  })

  it('applique la portée : une mission personnelle n’est visible que de son propriétaire', async () => {
    await seed('perso', { scope: { kind: 'personal', owner: 'brice' } })
    expect(await store.findBySlug(BRICE, 'perso')).not.toBeNull()
    expect(await store.findBySlug(CAMILLE, 'perso')).toBeNull()
    const result = await store.take({
      viewer: CAMILLE,
      target: { slug: 'perso' },
      session: sessionRef('web-9', 'camille'),
      tokenHash: 'h',
      at: MISSION_NOW,
    })
    expect(result.kind).toBe('not-found')
  })

  it('journalise la création', async () => {
    const mission = await seed('lcp-home')
    const events = await store.events(mission.id)
    expect(events.map((event) => event.type)).toEqual(['created'])
    expect(events[0]?.actor).toEqual({ userId: 'brice' })
  })

  it('une mission créée par une session en portée équipe est à valider', async () => {
    const { mission, event } = createMission(
      newMission('draft-1'),
      { kind: 'session', session: WEB_1 },
      MISSION_NOW,
    )
    await store.create(mission, event)
    expect((await store.findBySlug(BRICE, 'draft-1'))?.status).toBe('draft')
  })
})

describe('DrizzleMissionStore : take', () => {
  it('prend une mission par slug : réservation de 30 min, événement attribué à la session', async () => {
    await seed('lcp-home')
    const result = await takeSlug('lcp-home')
    if (result.kind !== 'taken') throw new Error(result.kind)
    expect(result.mission.claim).toEqual({
      session: WEB_1,
      acquiredAt: MISSION_NOW.toISOString(),
      expiresAt: later(30).toISOString(),
    })
    expect(result.event).toMatchObject({ type: 'taken', actor: WEB_1 })
    expect(await store.findBySlug(BRICE, 'lcp-home')).toEqual(result.mission)
  })

  it('refuse une mission déjà prise', async () => {
    await seed('lcp-home')
    await takeSlug('lcp-home')
    const second = await takeSlug('lcp-home', WEB_2)
    expect(second).toMatchObject({ kind: 'refused', error: { rejection: 'invalid-status' } })
  })

  it('next : la plus prioritaire, puis la plus ancienne', async () => {
    await seed('p2-old', { priority: 'P2' }, later(-60))
    await seed('p1-new', { priority: 'P1' }, later(-10))
    await seed('p1-old', { priority: 'P1' }, later(-30))
    expect(takenSlug(await takeNext())).toBe('p1-old')
    expect(takenSlug(await takeNext())).toBe('p1-new')
    expect(takenSlug(await takeNext())).toBe('p2-old')
    expect((await takeNext()).kind).toBe('empty')
  })

  it('next : filtre sur TOUS les tags demandés et sur le repo', async () => {
    await seed('perf-only', { tags: ['perf'] })
    await seed('perf-home', { tags: ['perf', 'home'] })
    await seed('api-perf', {
      tags: ['perf', 'home'],
      codeRef: { repo: 'allovoisins/api', commit: 'def5678', files: [] },
    })
    expect(takenSlug(await takeNext(['perf', 'home'], 'allovoisins/front'))).toBe('perf-home')
    expect((await takeNext(['perf', 'home'], 'allovoisins/front')).kind).toBe('empty')
  })

  it('next : ignore les missions à valider et celles hors de portée', async () => {
    const { mission, event } = createMission(
      newMission('draft-1'),
      { kind: 'session', session: WEB_1 },
      MISSION_NOW,
    )
    await store.create(mission, event)
    await seed('camille-perso', { scope: { kind: 'personal', owner: 'camille' } })
    expect((await takeNext()).kind).toBe('empty')
  })

  it('libère d’abord une réservation échue, dans la même transaction (sans attendre le job)', async () => {
    await seed('lcp-home')
    await takeSlug('lcp-home', WEB_1)
    const result = await takeSlug('lcp-home', WEB_2, later(31))
    if (result.kind !== 'taken') throw new Error(result.kind)
    expect(result.mission.claim.session).toEqual(WEB_2)
    const mission = await store.findBySlug(BRICE, 'lcp-home')
    const events = await store.events(mission?.id ?? '')
    expect(events.map((event) => [event.type, event.detail])).toEqual([
      ['created', 'ready'],
      ['taken', null],
      ['released', 'réservation expirée'],
      ['taken', null],
    ])
  })

  it('ne prend pas une mission arrivée à échéance : elle est expirée au passage', async () => {
    await seed('vieille')
    expect((await takeNext([], null, later(14 * 24 * 60))).kind).toBe('empty')
    expect((await store.findBySlug(BRICE, 'vieille'))?.status).toBe('expired')
  })
})

describe('DrizzleMissionStore : apply et jeton de réservation', () => {
  beforeEach(async () => {
    await seed('lcp-home')
    await takeSlug('lcp-home', WEB_1, MISSION_NOW, 'hash-ok')
  })

  function complete(tokenHash: string | null, session = WEB_1) {
    return store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'complete', result: RESULT },
      actor: { kind: 'session', session },
      tokenHash,
      at: later(5),
    })
  }

  it('termine avec le bon jeton, et efface le jeton', async () => {
    expect(appliedStatus(await complete('hash-ok'))).toBe('done')
    const mission = await store.findBySlug(BRICE, 'lcp-home')
    expect(mission?.result).toEqual(RESULT)
    expect(mission?.claim).toBeNull()
  })

  it('refuse la session détentrice sans le bon jeton (même label sur une autre machine)', async () => {
    expect((await complete('hash-autre')).kind).toBe('token-mismatch')
    expect((await complete(null)).kind).toBe('token-mismatch')
    expect((await store.findBySlug(BRICE, 'lcp-home'))?.status).toBe('in_progress')
  })

  it('vérifie le jeton avant les règles métier (rien n’est révélé sans lui)', async () => {
    const result = await store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'complete', result: { ...RESULT, summary: '  ' } },
      actor: { kind: 'session', session: WEB_1 },
      tokenHash: 'hash-autre',
      at: later(5),
    })
    expect(result.kind).toBe('token-mismatch')
  })

  it('le jeton survit au contrôle de fraîcheur : freshness puis complete avec le même jeton', async () => {
    const freshness = await store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'freshness', changedFiles: [] },
      actor: { kind: 'session', session: WEB_1 },
      tokenHash: 'hash-ok',
      at: later(1),
    })
    expect(appliedStatus(freshness)).toBe('in_progress')
    expect(appliedStatus(await complete('hash-ok'))).toBe('done')
  })

  it('refuse une autre session : not-holder', async () => {
    expect(await complete('hash-ok', WEB_2)).toMatchObject({
      kind: 'refused',
      error: { rejection: 'not-holder' },
    })
  })

  it('un humain libère sans jeton ; le jeton est effacé', async () => {
    const result = await store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'release' },
      actor: { kind: 'human', userId: 'brice' },
      tokenHash: null,
      at: later(5),
    })
    expect(appliedStatus(result)).toBe('ready')
    const retaken = await takeSlug('lcp-home', WEB_2, later(6), 'hash-2')
    expect(retaken.kind).toBe('taken')
  })

  it('renouvelle la réservation du détenteur (sans événement), refuse un mauvais jeton', async () => {
    const renewed = await store.renew({
      viewer: BRICE,
      slug: 'lcp-home',
      session: WEB_1,
      tokenHash: 'hash-ok',
      at: later(20),
    })
    if (renewed.kind !== 'renewed') throw new Error(renewed.kind)
    expect(renewed.mission.claim.expiresAt).toBe(later(50).toISOString())
    expect((await store.findBySlug(BRICE, 'lcp-home'))?.claim?.expiresAt).toBe(
      later(50).toISOString(),
    )
    const events = await store.events(renewed.mission.id)
    expect(events.map((event) => event.type)).toEqual(['created', 'taken'])
    const wrong = await store.renew({
      viewer: BRICE,
      slug: 'lcp-home',
      session: WEB_1,
      tokenHash: 'nope',
      at: later(21),
    })
    expect(wrong.kind).toBe('token-mismatch')
  })

  it('rapporte la fraîcheur et la relit avec le nom de la session', async () => {
    const result = await store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'freshness', changedFiles: ['app/pages/index.vue'] },
      actor: { kind: 'session', session: WEB_1 },
      tokenHash: 'hash-ok',
      at: later(1),
    })
    expect(appliedStatus(result)).toBe('in_progress')
    expect((await store.findBySlug(BRICE, 'lcp-home'))?.freshness).toEqual({
      checkedAt: later(1).toISOString(),
      changedFiles: ['app/pages/index.vue'],
      checkedBy: WEB_1,
    })
  })
})

describe('DrizzleMissionStore : rejet, réouverture, échéances', () => {
  it('un rejet supprime la mission et ses tags, l’événement reste lisible', async () => {
    const { mission, event } = createMission(
      newMission('draft-1'),
      { kind: 'session', session: WEB_1 },
      MISSION_NOW,
    )
    await store.create(mission, event)
    const result = await store.apply({
      viewer: BRICE,
      slug: 'draft-1',
      command: { type: 'reject', reason: 'Hors sujet' },
      actor: { kind: 'human', userId: 'brice' },
      tokenHash: null,
      at: later(1),
    })
    expect(appliedStatus(result)).toBe('deleted')
    expect(await store.findBySlug(BRICE, 'draft-1')).toBeNull()
    const tags = database.db
      .select()
      .from(missionTags)
      .where(eq(missionTags.missionId, mission.id))
      .all()
    expect(tags).toEqual([])
    const events = await store.events(mission.id)
    expect(events.at(-1)).toMatchObject({
      type: 'rejected',
      missionSlug: 'draft-1',
      missionTitle: 'Mission draft-1',
      detail: 'Hors sujet',
    })
  })

  it('rouvre une mission terminée : prête, résultat effacé, historique conservé', async () => {
    await seed('lcp-home')
    await takeSlug('lcp-home', WEB_1, MISSION_NOW, 'hash-ok')
    await store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'complete', result: RESULT },
      actor: { kind: 'session', session: WEB_1 },
      tokenHash: 'hash-ok',
      at: later(5),
    })
    const reopened = await store.apply({
      viewer: BRICE,
      slug: 'lcp-home',
      command: { type: 'reopen' },
      actor: { kind: 'human', userId: 'brice' },
      tokenHash: null,
      at: later(10),
    })
    expect(appliedStatus(reopened)).toBe('ready')
    const mission = await store.findBySlug(BRICE, 'lcp-home')
    expect(mission?.result).toBeNull()
    expect((await store.events(mission?.id ?? '')).map((event) => event.type)).toEqual([
      'created',
      'taken',
      'completed',
      'reopened',
    ])
  })

  it('expireDue : libère les réservations échues et expire les missions non prises', async () => {
    await seed('prise')
    // Échéance à +10 min : après la prise (qui balaye l’échu), avant l’appel du job.
    await seed('oubliee', {}, later(-14 * 24 * 60 + 10))
    await takeSlug('prise', WEB_1, MISSION_NOW)
    expect(await store.expireDue(later(31))).toEqual({ expired: 1, released: 1 })
    expect((await store.findBySlug(BRICE, 'prise'))?.status).toBe('ready')
    expect((await store.findBySlug(BRICE, 'oubliee'))?.status).toBe('expired')
    expect(await store.expireDue(later(32))).toEqual({ expired: 0, released: 0 })
  })
})
