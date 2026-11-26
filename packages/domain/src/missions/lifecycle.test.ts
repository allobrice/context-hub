import { describe, expect, it } from 'vitest'

import type { Scope } from '../context/types.ts'
import type { SessionRef } from '../sessions/session.ts'
import type { Result } from '../shared/result.ts'
import {
  MISSION_COMMAND_TYPES,
  MISSION_TRANSITIONS,
  createMission,
  editEvent,
  initialStatus,
  renewClaim,
  transition,
  type CreatorActor,
  type MissionCommand,
  type MissionCommandType,
  type NewMission,
  type Transition,
  type TransitionError,
  type TransitionRule,
} from './lifecycle.ts'
import {
  MISSION_EXPIRY_MS,
  MISSION_RESERVATION_MINUTES,
  MISSION_STATUSES,
  type ActorKind,
  type DoneMission,
  type DraftMission,
  type DroppedMission,
  type ExpiredMission,
  type InProgressMission,
  type Mission,
  type MissionActor,
  type MissionCore,
  type MissionEvent,
  type MissionEventType,
  type MissionResult,
  type MissionStatus,
  type ReadyMission,
} from './types.ts'

// ── Horloge ──────────────────────────────────────────────────────────────────

const MINUTE_MS = 60 * 1000
const NOW = new Date('2026-11-25T10:00:00.000Z')
const NOW_ISO = NOW.toISOString()
const CREATED_AT = '2026-11-20T10:00:00.000Z'
/** Échéance de la mission : création + 14 jours. */
const MISSION_DUE = '2026-12-04T10:00:00.000Z'
const CLAIM_ACQUIRED = '2026-11-25T09:50:00.000Z'
/** Échéance de la réservation en cours : prise à 9 h 50, pour 30 minutes. */
const CLAIM_DUE = '2026-11-25T10:20:00.000Z'
const CLOSED_AT = '2026-11-22T15:00:00.000Z'

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS)
}

const justBefore = (iso: string) => new Date(Date.parse(iso) - 1)

// ── Acteurs ──────────────────────────────────────────────────────────────────

const HOLDER: SessionRef = {
  userId: 'u-brice',
  userName: 'Brice',
  sessionLabel: 'web-1',
  repo: 'allovoisins/front',
}
/** Même utilisateur, autre session. */
const OTHER_LABEL: SessionRef = { ...HOLDER, sessionLabel: 'web-2' }
/** Même label, autre utilisateur. */
const OTHER_USER: SessionRef = { ...HOLDER, userId: 'u-alice', userName: 'Alice' }

const sessionActor = (session: SessionRef): MissionActor => ({ kind: 'session', session })
const HUMAN: MissionActor = { kind: 'human', userId: 'u-lead' }
const JOB: MissionActor = { kind: 'job' }

const ACTORS: Readonly<Record<ActorKind, MissionActor>> = {
  session: sessionActor(HOLDER),
  human: HUMAN,
  job: JOB,
}
const ACTOR_KINDS = ['session', 'human', 'job'] as const satisfies readonly ActorKind[]

// ── Fabriques de missions ────────────────────────────────────────────────────

const RESULT: MissionResult = {
  summary: 'LCP 4,1 s → 2,3 s',
  deliverables: [{ kind: 'pr', ref: 'allovoisins/front#42' }],
  metrics: [{ name: 'LCP', before: '4,1 s', after: '2,3 s' }],
  acceptanceMet: true,
}

const VALIDATION = { by: 'u-lead', at: '2026-11-21T08:00:00.000Z' }

const FRESHNESS = {
  checkedAt: '2026-11-21T09:00:00.000Z',
  changedFiles: ['pages/index.vue'],
  checkedBy: OTHER_LABEL,
}

const NEW_MISSION: NewMission = {
  id: 'm-1',
  slug: 'lcp-accueil',
  title: 'Réduire le LCP de la page d’accueil',
  summary: 'Précharger l’image héros',
  prompt: '## Objectif\n\nRéduire le LCP.',
  priority: 'P1',
  tags: ['perf'],
  scope: { kind: 'team', team: 'web' },
  origin: { label: 'Audit perf', batchId: 'b-1', session: HOLDER, createdBy: 'u-brice' },
  codeRef: { repo: 'allovoisins/front', commit: 'abc1234', files: ['pages/index.vue'] },
  freshness: null,
  linkedContextIds: [],
  workspaceId: null,
  suspicious: false,
}

const CORE: MissionCore = {
  ...NEW_MISSION,
  createdAt: CREATED_AT,
  expiresAt: MISSION_DUE,
  updatedAt: CREATED_AT,
}

type CoreOverrides = Partial<MissionCore>

const OPEN = { claim: null, result: null, dropReason: null, closedAt: null } as const

function draftMission(overrides: CoreOverrides = {}): DraftMission {
  return { ...CORE, ...overrides, ...OPEN, status: 'draft', validation: null }
}

function readyMission(overrides: CoreOverrides = {}): ReadyMission {
  return { ...CORE, ...overrides, ...OPEN, status: 'ready', validation: VALIDATION }
}

function inProgress(
  session: SessionRef = HOLDER,
  expiresAt: string = CLAIM_DUE,
  overrides: CoreOverrides = {},
): InProgressMission {
  return {
    ...CORE,
    ...overrides,
    status: 'in_progress',
    validation: VALIDATION,
    claim: { session, acquiredAt: CLAIM_ACQUIRED, expiresAt },
    result: null,
    dropReason: null,
    closedAt: null,
  }
}

function doneMission(overrides: CoreOverrides = {}): DoneMission {
  return {
    ...CORE,
    freshness: FRESHNESS,
    ...overrides,
    status: 'done',
    validation: VALIDATION,
    claim: null,
    result: RESULT,
    dropReason: null,
    closedAt: CLOSED_AT,
  }
}

function droppedMission(overrides: CoreOverrides = {}): DroppedMission {
  return {
    ...CORE,
    freshness: FRESHNESS,
    ...overrides,
    status: 'dropped',
    validation: VALIDATION,
    claim: null,
    result: null,
    dropReason: 'Plus pertinent',
    closedAt: CLOSED_AT,
  }
}

function expiredMission(overrides: CoreOverrides = {}): ExpiredMission {
  return {
    ...CORE,
    ...overrides,
    status: 'expired',
    validation: null,
    claim: null,
    result: null,
    dropReason: null,
    closedAt: MISSION_DUE,
  }
}

/** Une mission « nominale » de chaque statut (en cours : tenue par `HOLDER`, réservation valide). */
function missionIn(status: MissionStatus): Mission {
  switch (status) {
    case 'draft':
      return draftMission()
    case 'ready':
      return readyMission()
    case 'in_progress':
      return inProgress()
    case 'done':
      return doneMission()
    case 'dropped':
      return droppedMission()
    case 'expired':
      return expiredMission()
  }
}

/** Une commande valide de chaque type : l'ajout d'une commande à la table ne compile plus ici. */
const COMMANDS: Readonly<Record<MissionCommandType, MissionCommand>> = {
  validate: { type: 'validate' },
  reject: { type: 'reject', reason: 'Doublon' },
  take: { type: 'take' },
  release: { type: 'release' },
  expireClaim: { type: 'expireClaim' },
  freshness: { type: 'freshness', changedFiles: ['pages/index.vue'] },
  complete: { type: 'complete', result: RESULT },
  drop: { type: 'drop', reason: 'Plus pertinent' },
  expire: { type: 'expire' },
  reopen: { type: 'reopen' },
}

/**
 * Immuabilité : `structuredClone` n'est pas typé dans ce paquet (ni DOM ni Node). La mission d'entrée
 * est gelée en profondeur (toute écriture lève une TypeError en mode strict), puis comparée à une
 * copie indépendante rendue par la même fabrique déterministe.
 */
function frozen<T>(value: T): T {
  deepFreeze(value)
  return value
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
}

// ── Lecture des résultats ────────────────────────────────────────────────────

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Succès attendu, refus reçu : ${JSON.stringify(result.error)}`)
  return result.value
}

function expectErr<T, E>(result: Result<T, E>): E {
  if (result.ok) throw new Error(`Refus attendu, succès reçu : ${JSON.stringify(result.value)}`)
  return result.error
}

function expectUpdated(result: Result<Transition, TransitionError>): {
  readonly mission: Mission
  readonly event: MissionEvent
} {
  const value = expectOk(result)
  if (value.kind !== 'updated') throw new Error(`Mise à jour attendue, reçu : ${value.kind}`)
  return value
}

function rejectionOf(result: Result<unknown, TransitionError>): TransitionError['rejection'] {
  return expectErr(result).rejection
}

function eventOf(
  type: MissionEventType,
  actor: MissionEvent['actor'],
  detail: string | null,
  at: Date = NOW,
): MissionEvent {
  return {
    missionId: CORE.id,
    missionSlug: CORE.slug,
    missionTitle: CORE.title,
    at: at.toISOString(),
    actor,
    type,
    detail,
  }
}

// ── Table des transitions ────────────────────────────────────────────────────

interface Cell {
  readonly name: string
  readonly command: MissionCommand
  readonly status: MissionStatus
  readonly actor: ActorKind
}

const ruleOf = (command: MissionCommand): TransitionRule => MISSION_TRANSITIONS[command.type]
const allowsStatus = (cell: Cell) => ruleOf(cell.command).from.includes(cell.status)
const allowsActor = (cell: Cell) => ruleOf(cell.command).actors.includes(cell.actor)

const ALL_CELLS: readonly Cell[] = Object.values(COMMANDS).flatMap((command) =>
  MISSION_STATUSES.flatMap((status) =>
    ACTOR_KINDS.map((actor) => ({
      name: `${command.type} · ${status} · ${actor}`,
      command,
      status,
      actor,
    })),
  ),
)
const INVALID_STATUS_CELLS = ALL_CELLS.filter((cell) => !allowsStatus(cell))
const ACTOR_NOT_ALLOWED_CELLS = ALL_CELLS.filter((cell) => allowsStatus(cell) && !allowsActor(cell))
const ALLOWED_CELLS = ALL_CELLS.filter((cell) => allowsStatus(cell) && allowsActor(cell))

/** Les cases autorisées, recopiées de SPEC §8.2 (plus `freshness` et `expireClaim`, techniques). */
const SPEC_ALLOWED_CELLS = [
  'validate · draft · human',
  'reject · draft · human',
  'take · ready · session',
  'release · in_progress · session',
  'release · in_progress · human',
  'expireClaim · in_progress · job',
  'freshness · in_progress · session',
  'complete · in_progress · session',
  'drop · ready · session',
  'drop · ready · human',
  'drop · in_progress · session',
  'drop · in_progress · human',
  'expire · draft · job',
  'expire · ready · job',
  'reopen · done · human',
  'reopen · dropped · human',
]

const run = (cell: Cell) =>
  transition(missionIn(cell.status), cell.command, ACTORS[cell.actor], NOW)

describe('MISSION_TRANSITIONS', () => {
  it('a une commande de test pour chaque commande de la table', () => {
    expect(Object.keys(COMMANDS).sort()).toEqual(Object.keys(MISSION_TRANSITIONS).sort())
  })

  it('autorise exactement les cases de SPEC §8.2', () => {
    expect(ALLOWED_CELLS.map((cell) => cell.name).sort()).toEqual([...SPEC_ALLOWED_CELLS].sort())
  })

  it('partitionne le produit commande × statut × acteur', () => {
    expect(INVALID_STATUS_CELLS.length).toBeGreaterThan(0)
    expect(ACTOR_NOT_ALLOWED_CELLS.length).toBeGreaterThan(0)
    expect(
      INVALID_STATUS_CELLS.length + ACTOR_NOT_ALLOWED_CELLS.length + ALLOWED_CELLS.length,
    ).toBe(Object.keys(COMMANDS).length * MISSION_STATUSES.length * ACTOR_KINDS.length)
  })
})

describe('transitions interdites', () => {
  // Chaque acteur est essayé, y compris ceux que la table refuse : `invalid-status` passe d'abord.
  it.each(INVALID_STATUS_CELLS)('$name → invalid-status', (cell) => {
    expect(expectErr(run(cell))).toEqual({
      rejection: 'invalid-status',
      status: cell.status,
      command: cell.command.type,
    })
  })

  it.each(ACTOR_NOT_ALLOWED_CELLS)('$name → actor-not-allowed', (cell) => {
    expect(expectErr(run(cell))).toEqual({
      rejection: 'actor-not-allowed',
      status: cell.status,
      command: cell.command.type,
    })
  })

  it('invalid-status est prioritaire sur actor-not-allowed', () => {
    // `take` n'accepte ni le statut `done` ni un humain.
    expect(rejectionOf(transition(doneMission(), COMMANDS.take, HUMAN, NOW))).toBe('invalid-status')
    expect(INVALID_STATUS_CELLS.some((cell) => !allowsActor(cell))).toBe(true)
  })
})

describe('cases autorisées', () => {
  it.each(ALLOWED_CELLS)('$name passe les contrôles de statut et d’acteur', (cell) => {
    const result = run(cell)
    if (!result.ok) {
      expect(['invalid-status', 'actor-not-allowed']).not.toContain(result.error.rejection)
    }
  })

  it.each(ALL_CELLS)('$name ne modifie pas la mission d’entrée', (cell) => {
    const mission = frozen(missionIn(cell.status))
    transition(mission, cell.command, ACTORS[cell.actor], NOW)
    expect(mission).toEqual(missionIn(cell.status))
  })
})

// ── Création ─────────────────────────────────────────────────────────────────

describe('initialStatus et createMission', () => {
  const PERSONAL: Scope = { kind: 'personal', owner: 'u-brice' }
  const PROJECT: Scope = { kind: 'project', repo: 'allovoisins/front' }
  const TEAM: Scope = { kind: 'team', team: 'web' }
  const BY_SESSION: CreatorActor = { kind: 'session', session: HOLDER }
  const BY_HUMAN: CreatorActor = { kind: 'human', userId: 'u-lead' }

  it.each([
    ['session', TEAM, 'draft'],
    ['session', PROJECT, 'draft'],
    ['session', PERSONAL, 'ready'],
    ['human', TEAM, 'ready'],
    ['human', PROJECT, 'ready'],
    ['human', PERSONAL, 'ready'],
  ] as const)('%s, portée %o → %s', (kind, scope, expected) => {
    const creator = kind === 'session' ? BY_SESSION : BY_HUMAN
    expect(initialStatus(scope, kind)).toBe(expected)

    const input = frozen({ ...NEW_MISSION, scope })
    const { mission, event } = createMission(input, creator, NOW)

    expect(mission).toEqual({
      ...input,
      createdAt: NOW_ISO,
      expiresAt: new Date(NOW.getTime() + MISSION_EXPIRY_MS).toISOString(),
      updatedAt: NOW_ISO,
      status: expected,
      validation: null,
      claim: null,
      result: null,
      dropReason: null,
      closedAt: null,
    })
    expect(mission.expiresAt).toBe('2026-12-09T10:00:00.000Z')
    expect(event).toEqual(
      eventOf('created', kind === 'session' ? HOLDER : { userId: 'u-lead' }, expected),
    )
    expect(input).toEqual({ ...NEW_MISSION, scope })
  })
})

// ── Transitions autorisées, une par une ──────────────────────────────────────

describe('validate', () => {
  it('draft → ready, validée par l’humain', () => {
    const mission = draftMission()
    const next = expectUpdated(transition(mission, COMMANDS.validate, HUMAN, NOW))
    expect(next.mission).toEqual({
      ...mission,
      status: 'ready',
      validation: { by: 'u-lead', at: NOW_ISO },
      updatedAt: NOW_ISO,
    })
    expect(next.event).toEqual(eventOf('validated', { userId: 'u-lead' }, null))
  })
})

describe('reject', () => {
  it.each([
    ['  Doublon  ', 'Doublon'],
    ['   ', null],
    ['', null],
    [null, null],
  ])('raison %j → mission supprimée, événement rejected (détail %j)', (reason, detail) => {
    const result = expectOk(transition(draftMission(), { type: 'reject', reason }, HUMAN, NOW))
    expect(result).toEqual({
      kind: 'deleted',
      event: eventOf('rejected', { userId: 'u-lead' }, detail),
    })
  })
})

describe('take', () => {
  it('ready → in_progress, réservation de 30 minutes pour la session', () => {
    const mission = readyMission()
    const next = expectUpdated(transition(mission, COMMANDS.take, sessionActor(OTHER_USER), NOW))
    expect(next.mission).toEqual({
      ...mission,
      status: 'in_progress',
      claim: {
        session: OTHER_USER,
        acquiredAt: NOW_ISO,
        expiresAt: minutesAfter(NOW, MISSION_RESERVATION_MINUTES).toISOString(),
      },
      updatedAt: NOW_ISO,
    })
    expect(next.event).toEqual(eventOf('taken', OTHER_USER, null))
  })
})

describe('release', () => {
  it('in_progress → ready par la session détentrice', () => {
    const mission = inProgress()
    const next = expectUpdated(transition(mission, COMMANDS.release, sessionActor(HOLDER), NOW))
    expect(next.mission).toEqual({ ...mission, status: 'ready', claim: null, updatedAt: NOW_ISO })
    expect(next.event).toEqual(eventOf('released', HOLDER, null))
  })

  it('in_progress → ready forcée par un humain, sans être détenteur', () => {
    const mission = inProgress(OTHER_USER)
    const next = expectUpdated(transition(mission, COMMANDS.release, HUMAN, NOW))
    expect(next.mission).toEqual({ ...mission, status: 'ready', claim: null, updatedAt: NOW_ISO })
    expect(next.event).toEqual(eventOf('released', { userId: 'u-lead' }, 'forcée'))
  })
})

describe('expireClaim', () => {
  it('refuse avant l’échéance de la réservation (not-due)', () => {
    const result = transition(inProgress(), COMMANDS.expireClaim, JOB, justBefore(CLAIM_DUE))
    expect(rejectionOf(result)).toBe('not-due')
  })

  it.each([CLAIM_DUE, '2026-11-25T11:00:00.000Z'])(
    'in_progress → ready à %s, événement released « réservation expirée »',
    (iso) => {
      const now = new Date(iso)
      const mission = inProgress()
      const next = expectUpdated(transition(mission, COMMANDS.expireClaim, JOB, now))
      expect(next.mission).toEqual({ ...mission, status: 'ready', claim: null, updatedAt: iso })
      expect(next.event).toEqual(eventOf('released', { system: 'job' }, 'réservation expirée', now))
    },
  )
})

describe('freshness', () => {
  it('enregistre le contrôle et prolonge la réservation', () => {
    const mission = inProgress()
    const command: MissionCommand = { type: 'freshness', changedFiles: ['pages/index.vue'] }
    const next = expectUpdated(transition(mission, command, sessionActor(HOLDER), NOW))
    expect(next.mission).toEqual({
      ...mission,
      freshness: { checkedAt: NOW_ISO, changedFiles: ['pages/index.vue'], checkedBy: HOLDER },
      claim: {
        ...mission.claim,
        expiresAt: minutesAfter(NOW, MISSION_RESERVATION_MINUTES).toISOString(),
      },
      updatedAt: NOW_ISO,
    })
    expect(next.event).toEqual(eventOf('freshness', HOLDER, '1 fichier(s) modifié(s)'))
  })

  it('ignore les fichiers absents de la mission (et les doublons)', () => {
    const command: MissionCommand = {
      type: 'freshness',
      changedFiles: ['pages/index.vue', 'hors/mission.ts', 'pages/index.vue', 'README.md'],
    }
    const next = expectUpdated(transition(inProgress(), command, sessionActor(HOLDER), NOW))
    expect(next.mission.freshness?.changedFiles).toEqual(['pages/index.vue'])
    expect(next.event.detail).toBe('1 fichier(s) modifié(s)')
  })

  it('accepte une liste vide', () => {
    const next = expectUpdated(
      transition(inProgress(), { type: 'freshness', changedFiles: [] }, sessionActor(HOLDER), NOW),
    )
    expect(next.event.detail).toBe('0 fichier(s) modifié(s)')
  })
})

describe('complete', () => {
  it('in_progress → done avec le résultat', () => {
    const mission = inProgress()
    const next = expectUpdated(transition(mission, COMMANDS.complete, sessionActor(HOLDER), NOW))
    expect(next.mission).toEqual({
      ...mission,
      status: 'done',
      claim: null,
      result: RESULT,
      closedAt: NOW_ISO,
      updatedAt: NOW_ISO,
    })
    expect(next.event).toEqual(eventOf('completed', HOLDER, null))
  })

  it.each(['', '   ', '\n\t'])('refuse un résumé blanc %j (summary-required)', (summary) => {
    const command: MissionCommand = { type: 'complete', result: { ...RESULT, summary } }
    expect(rejectionOf(transition(inProgress(), command, sessionActor(HOLDER), NOW))).toBe(
      'summary-required',
    )
  })
})

describe('drop', () => {
  const DROP: MissionCommand = { type: 'drop', reason: '  Plus pertinent  ' }

  it.each([
    ['la session détentrice', inProgress(), sessionActor(HOLDER), HOLDER],
    ['un humain non détenteur', inProgress(OTHER_USER), HUMAN, { userId: 'u-lead' }],
    ['un humain (ready)', readyMission(), HUMAN, { userId: 'u-lead' }],
  ])('→ dropped par %s, raison trimée', (_, mission, actor, eventActor) => {
    const next = expectUpdated(transition(mission, DROP, actor, NOW))
    expect(next.mission).toEqual({
      ...mission,
      status: 'dropped',
      claim: null,
      dropReason: 'Plus pertinent',
      closedAt: NOW_ISO,
      updatedAt: NOW_ISO,
    })
    expect(next.event).toEqual(eventOf('dropped', eventActor, 'Plus pertinent'))
  })

  it('une session ne peut pas abandonner une mission prête qu’elle ne tient pas (not-holder)', () => {
    expect(rejectionOf(transition(readyMission(), DROP, sessionActor(OTHER_USER), NOW))).toBe(
      'not-holder',
    )
  })

  it.each([
    ['ready', readyMission(), HUMAN],
    ['in_progress', inProgress(), sessionActor(HOLDER)],
    ['in_progress', inProgress(), HUMAN],
  ])('%s : refuse une raison vide ou blanche (reason-required)', (_, mission, actor) => {
    for (const reason of ['', '   ', '\n']) {
      expect(rejectionOf(transition(mission, { type: 'drop', reason }, actor, NOW))).toBe(
        'reason-required',
      )
    }
  })
})

describe('expire', () => {
  it.each([
    ['draft', draftMission()],
    ['ready', readyMission()],
  ])('%s : refuse avant expiresAt (not-due)', (_, mission) => {
    expect(rejectionOf(transition(mission, COMMANDS.expire, JOB, justBefore(MISSION_DUE)))).toBe(
      'not-due',
    )
  })

  it.each([
    ['draft', draftMission()],
    ['ready', readyMission()],
  ])('%s → expired à l’échéance exacte', (_, mission) => {
    const now = new Date(MISSION_DUE)
    const next = expectUpdated(transition(mission, COMMANDS.expire, JOB, now))
    expect(next.mission).toEqual({
      ...mission,
      status: 'expired',
      closedAt: MISSION_DUE,
      updatedAt: MISSION_DUE,
    })
    expect(next.event).toEqual(eventOf('expired', { system: 'job' }, null, now))
  })
})

describe('reopen', () => {
  it.each([
    ['done', doneMission()],
    ['dropped', droppedMission()],
  ])('%s → ready : nouveau cycle, validation et fraîcheur conservées', (_, mission) => {
    const next = expectUpdated(transition(mission, COMMANDS.reopen, HUMAN, NOW))
    expect(next.mission).toEqual({
      ...mission,
      status: 'ready',
      result: null,
      dropReason: null,
      closedAt: null,
      expiresAt: '2026-12-09T10:00:00.000Z',
      updatedAt: NOW_ISO,
    })
    expect(next.mission.validation).toEqual(VALIDATION)
    expect(next.mission.freshness).toEqual(FRESHNESS)
    expect(next.event).toEqual(eventOf('reopened', { userId: 'u-lead' }, null))
  })
})

// ── Détenteur de la réservation ──────────────────────────────────────────────

describe('commandes réservées au détenteur', () => {
  const HOLDER_COMMANDS: readonly MissionCommand[] = [
    COMMANDS.release,
    COMMANDS.freshness,
    COMMANDS.complete,
    COMMANDS.drop,
  ]

  it.each(HOLDER_COMMANDS)('$type par une autre session → not-holder', (command) => {
    for (const other of [OTHER_LABEL, OTHER_USER]) {
      expect(expectErr(transition(inProgress(), command, sessionActor(other), NOW))).toEqual({
        rejection: 'not-holder',
        status: 'in_progress',
        command: command.type,
      })
    }
  })

  it.each(HOLDER_COMMANDS)(
    '$type par le détenteur, réservation échue → claim-expired',
    (command) => {
      for (const now of [new Date(CLAIM_DUE), minutesAfter(new Date(CLAIM_DUE), 5)]) {
        expect(rejectionOf(transition(inProgress(), command, sessionActor(HOLDER), now))).toBe(
          'claim-expired',
        )
      }
    },
  )

  it.each([COMMANDS.release, COMMANDS.drop])(
    '$type par un humain : pas de contrôle de détenteur, même réservation échue',
    (command) => {
      const result = transition(inProgress(OTHER_USER), command, HUMAN, new Date(CLAIM_DUE))
      expect(expectUpdated(result).mission.status).toBe(
        command.type === 'release' ? 'ready' : 'dropped',
      )
    },
  )
})

// ── Prolongation, échéances ──────────────────────────────────────────────────

describe('renewClaim', () => {
  it('prolonge la réservation du détenteur de 30 minutes, sans événement', () => {
    const mission = frozen(inProgress())
    const renewed = expectOk(renewClaim(mission, HOLDER, NOW))
    expect(renewed).toEqual({
      ...mission,
      claim: { ...mission.claim, expiresAt: '2026-11-25T10:30:00.000Z' },
    })
    expect(renewed).not.toHaveProperty('event')
    expect(mission).toEqual(inProgress())
  })

  it.each([
    ['not-holder (autre label)', inProgress(), OTHER_LABEL, NOW, 'not-holder'],
    ['not-holder (autre utilisateur)', inProgress(), OTHER_USER, NOW, 'not-holder'],
    ['claim-expired', inProgress(), HOLDER, new Date(CLAIM_DUE), 'claim-expired'],
    ['invalid-status', readyMission(), HOLDER, NOW, 'invalid-status'],
  ] as const)('refuse : %s', (_, mission, session, now, rejection) => {
    expect(expectErr(renewClaim(mission, session, now))).toEqual({
      rejection,
      status: mission.status,
      command: 'renew',
    })
  })
})

describe('listes dérivées de la table', () => {
  it('MISSION_COMMAND_TYPES couvre exactement les commandes de MISSION_TRANSITIONS', () => {
    expect([...MISSION_COMMAND_TYPES].sort()).toEqual(Object.keys(MISSION_TRANSITIONS).sort())
  })
})

describe('editEvent', () => {
  const edit = (mission: ReadyMission) => ({
    title: mission.title,
    summary: mission.summary,
    prompt: mission.prompt,
    priority: mission.priority,
    tags: mission.tags,
  })

  it('liste les champs réellement changés, attribués à l’humain, avec le nouveau titre', () => {
    const mission = readyMission()
    const event = editEvent(
      mission,
      {
        ...edit(mission),
        title: 'Nouveau titre',
        prompt: `${mission.prompt}\nPlus.`,
        priority: 'P3',
      },
      'u-lead',
      NOW,
    )
    expect(event).toEqual({
      missionId: mission.id,
      missionSlug: mission.slug,
      missionTitle: 'Nouveau titre',
      at: NOW_ISO,
      actor: { userId: 'u-lead' },
      type: 'edited',
      detail: 'titre, prompt, priorité',
    })
  })

  it('tags : l’ordre compte ; rien de changé : pas d’événement', () => {
    const mission = readyMission({ tags: ['perf', 'web'] })
    expect(editEvent(mission, { ...edit(mission), tags: ['web', 'perf'] }, 'u', NOW)?.detail).toBe(
      'tags',
    )
    expect(editEvent(mission, edit(mission), 'u', NOW)).toBeNull()
  })
})
