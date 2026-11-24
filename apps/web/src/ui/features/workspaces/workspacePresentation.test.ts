import { describe, expect, it } from 'vitest'

import type { WorkspaceEntry } from '@context-hub/domain/workspaces/types.ts'

import {
  authorLines,
  formatDuration,
  formatElapsed,
  isBlockedWrite,
  minutesLeft,
  participantActivity,
  proposalFromEntry,
  sessionsLabel,
} from './workspacePresentation.ts'

const NOW = new Date('2026-11-23T10:12:00.000Z')
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

const DECISION: WorkspaceEntry = {
  workspaceId: 'ws',
  seq: 47,
  kind: 'decision',
  body: 'Le cookie de session s’appelle av_session. POST /auth/session remplace POST /auth/token.',
  files: ['server/api/auth/session.post.ts'],
  author: { userId: 'brice', userName: 'Brice', sessionLabel: 'api-1', repo: 'allovoisins/api' },
  redactions: 0,
  suspicious: false,
  createdAt: ago(120),
}

describe('présentation des workspaces', () => {
  it('formatElapsed : secondes puis format relatif (maquette 26)', () => {
    expect(formatElapsed(ago(2), NOW)).toBe('à l’instant')
    expect(formatElapsed(ago(40), NOW)).toBe('il y a 40 s')
    expect(formatElapsed(ago(120), NOW)).toBe('il y a 2 min')
  })

  it('participantActivity : actif ou « inactif · 25 min »', () => {
    expect(participantActivity(ago(0), true, NOW)).toBe('à l’instant')
    expect(participantActivity(ago(25 * 60), false, NOW)).toBe('inactif · 25 min')
  })

  it('minutesLeft et sessionsLabel', () => {
    expect(
      minutesLeft({ expiresAt: new Date(NOW.getTime() + 22 * 60_000).toISOString() }, NOW),
    ).toBe(22)
    expect(minutesLeft({ expiresAt: ago(60) }, NOW)).toBe(0)
    expect(sessionsLabel(3, 4)).toBe('3 actives / 4')
    expect(sessionsLabel(1, 2)).toBe('1 active / 2')
  })

  it('formatDuration : « 2 h 20 » (maquette 28)', () => {
    expect(formatDuration('2026-11-23T08:00:00Z', '2026-11-23T10:20:00Z')).toBe('2 h 20')
    expect(formatDuration('2026-11-23T08:00:00Z', '2026-11-23T08:45:00Z')).toBe('45 min')
    expect(formatDuration('2026-11-01T08:00:00Z', '2026-11-04T08:00:00Z')).toBe('3 j')
  })

  it('auteur : session et « utilisateur · repo », ou context-hub et la source', () => {
    expect(authorLines(DECISION.author)).toEqual({
      session: 'api-1',
      detail: 'Brice · allovoisins/api',
    })
    expect(authorLines({ system: 'hook' })).toEqual({
      session: 'context-hub',
      detail: 'hook PreToolUse',
    })
    expect(isBlockedWrite({ ...DECISION, kind: 'system', author: { system: 'hook' } })).toBe(true)
  })

  it('proposalFromEntry : titre (première phrase), source citée, fichiers', () => {
    const proposal = proposalFromEntry({ slug: 'migration-auth', title: 'Migration' }, DECISION)
    expect(proposal.title).toBe('Le cookie de session s’appelle av_session.')
    expect(proposal.description).toBe('Décision #47 du workspace migration-auth')
    expect(proposal.content).toContain('> Proposé depuis la décision #47 (api-1)')
    expect(proposal.content).toContain('- `server/api/auth/session.post.ts`')
  })
})
