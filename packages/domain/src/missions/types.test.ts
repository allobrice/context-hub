import { describe, expect, it } from 'vitest'

import { MISSION_FIXTURES } from '../fixtures/missions.ts'
import {
  InconsistentMissionError,
  MISSION_STATUSES,
  missionFromFields,
  type Mission,
  type MissionCore,
  type MissionStatus,
  type MissionStatusFields,
} from './types.ts'

/** Sépare une mission en cœur + champs plats, comme le font les colonnes SQL et le DTO. */
function flatten(mission: Mission): { core: MissionCore; fields: MissionStatusFields } {
  const { status, validation, claim, result, dropReason, closedAt, ...core } = mission
  return { core, fields: { status, validation, claim, result, dropReason, closedAt } }
}

function fixtureOf(status: MissionStatus): Mission | undefined {
  return MISSION_FIXTURES.find(({ mission }) => mission.status === status)?.mission
}

const BASE = MISSION_FIXTURES[0]?.mission
if (BASE === undefined) throw new Error('fixtures des missions vides')
const { core } = flatten(BASE)

const CLAIM = {
  session: { userId: 'brice', userName: 'Brice', sessionLabel: 'web-1', repo: null },
  acquiredAt: '2026-11-23T10:00:00.000Z',
  expiresAt: '2026-11-23T10:30:00.000Z',
}
const RESULT = { summary: 'Fait.', deliverables: [], metrics: [], acceptanceMet: true }
const CLOSED_AT = '2026-11-23T11:00:00.000Z'
const VALIDATION = { by: 'brice', at: '2026-11-22T09:00:00.000Z' }

/** Tous les champs propres à un statut remplis : seuls ceux du statut doivent être retenus. */
function fullFields(status: MissionStatus): MissionStatusFields {
  return {
    status,
    validation: VALIDATION,
    claim: CLAIM,
    result: RESULT,
    dropReason: 'Constat périmé',
    closedAt: CLOSED_AT,
  }
}

describe('missionFromFields', () => {
  it('reconstruit à l’identique chaque mission des fixtures', () => {
    for (const { mission } of MISSION_FIXTURES) {
      const { core: missionCore, fields } = flatten(mission)
      expect(missionFromFields(missionCore, fields)).toEqual(mission)
    }
    expect(
      (['draft', 'ready', 'in_progress', 'done', 'dropped'] as const).map(fixtureOf),
    ).not.toContain(undefined)
  })

  it('ne garde que les champs du statut (les autres sont remis à null)', () => {
    const expected: Record<MissionStatus, Partial<Mission>> = {
      draft: { validation: null, claim: null, result: null, dropReason: null, closedAt: null },
      ready: { validation: VALIDATION, claim: null, result: null, closedAt: null },
      in_progress: { claim: CLAIM, result: null, dropReason: null, closedAt: null },
      done: { claim: null, result: RESULT, dropReason: null, closedAt: CLOSED_AT },
      dropped: { claim: null, result: null, dropReason: 'Constat périmé', closedAt: CLOSED_AT },
      expired: { claim: null, result: null, dropReason: null, closedAt: CLOSED_AT },
    }
    for (const status of MISSION_STATUSES) {
      const mission = missionFromFields(core, fullFields(status))
      expect(mission).toMatchObject({ ...core, status, ...expected[status] })
    }
  })

  it.each([
    ['in_progress', 'claim'],
    ['done', 'result'],
    ['done', 'closedAt'],
    ['dropped', 'dropReason'],
    ['dropped', 'closedAt'],
    ['expired', 'closedAt'],
  ] as const)('%s sans %s : InconsistentMissionError explicite', (status, field) => {
    const fields = { ...fullFields(status), [field]: null }
    expect(() => missionFromFields(core, fields)).toThrow(InconsistentMissionError)
    expect(() => missionFromFields(core, fields)).toThrow(
      `Mission ${core.slug} incohérente : ${field} manquant pour le statut ${status}`,
    )
  })

  it('à valider ou prête : aucun champ de clôture ni réservation requis', () => {
    const empty = { validation: null, claim: null, result: null, dropReason: null, closedAt: null }
    expect(missionFromFields(core, { status: 'draft', ...empty }).status).toBe('draft')
    expect(missionFromFields(core, { status: 'ready', ...empty }).status).toBe('ready')
  })
})
