import { describe, expect, it } from 'vitest'

import { defaultLabel, parseCommand, slugify } from '../scripts/lib/commands.mjs'
import { readConfig } from '../scripts/lib/config.mjs'
import { localRepoName, parseRemote } from '../scripts/lib/git.mjs'

describe('parseCommand', () => {
  it.each([
    ['/context-hub:join migration-auth', { kind: 'join', slug: 'migration-auth', label: null }],
    [
      '  /context-hub:join migration-auth web-1 ',
      { kind: 'join', slug: 'migration-auth', label: 'web-1' },
    ],
    [
      '/context-hub:new "Migration de l’auth"',
      { kind: 'new', title: 'Migration de l’auth', label: null },
    ],
    ['/context-hub:new « Refonte » search-1', { kind: 'new', title: 'Refonte', label: 'search-1' }],
    [
      '/context-hub:new Titre sans guillemets',
      { kind: 'new', title: 'Titre sans guillemets', label: null },
    ],
    ['/context-hub:status', { kind: 'status' }],
    ['/context-hub:leave', { kind: 'leave' }],
  ])('%j', (prompt, expected) => {
    expect(parseCommand(prompt)).toEqual(expected)
  })

  it.each([
    '/context-hub:join',
    '/context-hub:join Migration',
    '/context-hub:join migration-auth WEB 1',
    '/context-hub:join migration-auth $(whoami)',
    '/context-hub:join migration-auth web-1 extra',
    '/context-hub:new ""',
  ])('refuse %j', (prompt) => {
    expect(parseCommand(prompt)).toMatchObject({ kind: 'invalid' })
  })

  it('ignore les prompts ordinaires et les autres commandes', () => {
    expect(parseCommand('rejoins migration-auth')).toBeNull()
    expect(parseCommand('/context-hub:inconnue')).toBeNull()
    expect(parseCommand('/autre:join x')).toBeNull()
  })
})

describe('utilitaires', () => {
  it('slugify', () => {
    expect(slugify('Migration de l’auth vers les sessions Nitro')).toBe(
      'migration-de-l-auth-vers-les-sessions-nitro',
    )
    expect(slugify('***')).toBe('')
  })

  it('defaultLabel respecte le motif des labels', () => {
    expect(defaultLabel('allovoisins/front', 'BEAD11ab-7ab7')).toBe('front-bead')
    expect(defaultLabel('local/Mon Repo', '!!')).toMatch(/^[a-z0-9][a-z0-9._-]{0,31}$/)
  })

  it.each([
    ['git@github.com:allovoisins/front.git', 'allovoisins/front'],
    ['https://github.com/allovoisins/api', 'allovoisins/api'],
    ['https://github.com/allovoisins/api.git', 'allovoisins/api'],
    ['ssh://git@gitlab.example.com:2222/team/sub/repo.git', 'sub/repo'],
  ])('parseRemote %s', (url, repo) => {
    expect(parseRemote(url)).toBe(repo)
  })

  it('localRepoName', () => {
    expect(localRepoName('/home/dev/Mon Projet')).toBe('local/Mon-Projet')
  })

  it('readConfig : défauts et fail mode', () => {
    expect(readConfig({ CLAUDE_PLUGIN_DATA: '/data' })).toEqual({
      url: 'http://127.0.0.1:8787',
      token: null,
      failMode: 'open',
      repoOverride: null,
      dataDir: '/data',
    })
    expect(
      readConfig({
        CONTEXT_HUB_URL: 'https://hub.example/',
        CONTEXT_HUB_TOKEN: 'chub_x',
        CONTEXT_HUB_FAIL_MODE: 'closed',
        CONTEXT_HUB_REPO: 'allovoisins/front',
      }),
    ).toMatchObject({
      url: 'https://hub.example',
      token: 'chub_x',
      failMode: 'closed',
      repoOverride: 'allovoisins/front',
    })
  })
})

describe('parseCommand : missions', () => {
  it.each([
    ['/context-hub:next', { kind: 'next', tags: [] }],
    ['/context-hub:next perf', { kind: 'next', tags: ['perf'] }],
    ['/context-hub:next Perf a11y', { kind: 'next', tags: ['perf', 'a11y'] }],
    ['/context-hub:take perf-lcp-carrousel', { kind: 'take', slug: 'perf-lcp-carrousel' }],
    ['/context-hub:missions', { kind: 'missions' }],
  ])('%s', (prompt, expected) => {
    expect(parseCommand(prompt)).toEqual(expected)
  })

  it.each([
    '/context-hub:take',
    '/context-hub:take Perf_LCP',
    '/context-hub:take a b',
    '/context-hub:take $(whoami)',
    '/context-hub:next perf;rm',
    `/context-hub:next ${Array.from({ length: 11 }, (_, i) => `t${String(i)}`).join(' ')}`,
  ])('refuse %s', (prompt) => {
    expect(parseCommand(prompt)).toMatchObject({ kind: 'invalid' })
  })

  it('mission-create : reconnue (le hook ne fait que donner l’identité)', () => {
    expect(parseCommand('/context-hub:mission-create depuis l’audit')).toEqual({
      kind: 'mission-create',
    })
  })
})
