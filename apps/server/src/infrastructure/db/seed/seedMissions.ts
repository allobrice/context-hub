/**
 * Missions de démo (maquettes 31 à 39). Les dates des fixtures sont relatives à `DEMO_NOW` : elles
 * sont décalées sur le « maintenant » du seed, pour que « expire dans 13 j » ou « réservée depuis
 * 18 min » gardent le sens des maquettes quel que soit le jour où l'on seede. La mission en cours
 * n'a pas de jeton de réservation : aucune session réelle ne la tient.
 */
import { MISSION_FIXTURES } from '@context-hub/domain/fixtures/missions.ts'
import { DEMO_NOW } from '@context-hub/domain/fixtures/now.ts'
import type { Mission, MissionEvent } from '@context-hub/domain/missions/types.ts'

import type { SyncDb } from '../connection.ts'
import { missions } from '../schema.ts'
import { appendEvent, insertTags, missionRow } from '../stores/missionRecords.ts'

type Shift = (iso: string) => string

function shifter(now: Date): Shift {
  const offset = now.getTime() - Date.parse(DEMO_NOW)
  return (iso) => new Date(Date.parse(iso) + offset).toISOString()
}

function shiftMission(mission: Mission, shift: Shift): Mission {
  const dates = {
    createdAt: shift(mission.createdAt),
    expiresAt: shift(mission.expiresAt),
    updatedAt: shift(mission.updatedAt),
    validation: mission.validation && { ...mission.validation, at: shift(mission.validation.at) },
    freshness: mission.freshness && {
      ...mission.freshness,
      checkedAt: shift(mission.freshness.checkedAt),
    },
  }
  switch (mission.status) {
    case 'in_progress':
      return {
        ...mission,
        ...dates,
        claim: {
          ...mission.claim,
          acquiredAt: shift(mission.claim.acquiredAt),
          expiresAt: shift(mission.claim.expiresAt),
        },
      }
    case 'done':
    case 'dropped':
    case 'expired':
      return { ...mission, ...dates, closedAt: shift(mission.closedAt) }
    case 'draft':
      return { ...mission, ...dates, validation: null }
    case 'ready':
      return { ...mission, ...dates }
  }
}

function shiftEvent(event: MissionEvent, shift: Shift): MissionEvent {
  return { ...event, at: shift(event.at) }
}

export function seedMissions(db: SyncDb, now: Date): void {
  const shift = shifter(now)
  for (const fixture of MISSION_FIXTURES) {
    const mission = shiftMission(fixture.mission, shift)
    db.insert(missions).values(missionRow(mission)).run()
    insertTags(db, mission.id, mission.tags)
    for (const event of fixture.events) appendEvent(db, shiftEvent(event, shift))
  }
}
