import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Api, ApiResult } from '../scripts/lib/api.mjs'
import type { Config } from '../scripts/lib/config.mjs'
import type { Git } from '../scripts/lib/git.mjs'
import {
  onPreToolUse,
  onSessionStart,
  onUserPromptSubmit,
  type Deps,
  type HookInput,
} from '../scripts/lib/handlers.mjs'
import { readState, writeState, type SessionState } from '../scripts/lib/state.mjs'

const ROOT = '/home/dev/front'
const SESSION_A = 'aaaa1111-0000-4000-8000-000000000001'
const SESSION_B = 'bbbb2222-0000-4000-8000-000000000002'

interface Call {
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly body: unknown
}

type Route = (body: unknown) => ApiResult

let dataDir: string
let calls: Call[]
let routes: Map<string, Route>

const ok = (body: unknown): ApiResult => ({ kind: 'ok', status: 200, body })
const httpError = (status: number, code: string): ApiResult => ({
  kind: 'http-error',
  status,
  code,
  message: code,
})
const unreachable: ApiResult = { kind: 'unreachable', reason: 'TimeoutError' }

const fakeApi: Api = {
  post: (path, body) => {
    calls.push({ method: 'POST', path, body })
    return Promise.resolve(routes.get(`POST ${path}`)?.(body) ?? unreachable)
  },
  get: (path) => {
    calls.push({ method: 'GET', path, body: undefined })
    return Promise.resolve(routes.get(`GET ${path}`)?.(undefined) ?? unreachable)
  },
}

const fakeGit: Git = {
  repoRoot: () => ROOT,
  remoteUrl: () => 'git@github.com:allovoisins/front.git',
}

function deps(overrides: Partial<Config> = {}): Deps {
  const config: Config = {
    url: 'http://hub',
    token: 'chub_test',
    failMode: 'open',
    repoOverride: null,
    dataDir,
    ...overrides,
  }
  return { config, api: fakeApi, git: fakeGit, now: () => new Date('2026-11-23T10:12:00Z') }
}

function input(sessionId: string, extra: Partial<HookInput> = {}): HookInput {
  return { session_id: sessionId, cwd: ROOT, ...extra }
}

function joinedState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    version: 1,
    workspace: 'migration-auth',
    label: 'web-2',
    repo: 'allovoisins/front',
    repoRoot: ROOT,
    cursor: 49,
    joinedAt: '2026-11-23T10:00:00.000Z',
    ...overrides,
  }
}

/** `additionalContext` d'une sortie, ou null. */
function contextOf(output: unknown): string | null {
  if (
    typeof output === 'object' &&
    output !== null &&
    'hookSpecificOutput' in output &&
    typeof output.hookSpecificOutput === 'object' &&
    output.hookSpecificOutput !== null &&
    'additionalContext' in output.hookSpecificOutput &&
    typeof output.hookSpecificOutput.additionalContext === 'string'
  ) {
    return output.hookSpecificOutput.additionalContext
  }
  return null
}

/** `systemMessage` d'une sortie, ou null. */
function systemMessageOf(output: unknown): string | null {
  return typeof output === 'object' &&
    output !== null &&
    'systemMessage' in output &&
    typeof output.systemMessage === 'string'
    ? output.systemMessage
    : null
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'context-hub-plugin-'))
  calls = []
  routes = new Map()
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('/context-hub:join', () => {
  beforeEach(() => {
    routes.set('POST /api/workspaces/migration-auth/join', () =>
      ok({ digest: 'Workspace migration-auth : résumé…', cursor: 49 }),
    )
  })

  it('rejoint, mémorise l’état de CETTE session et injecte le résumé', async () => {
    const output = await onUserPromptSubmit(
      input(SESSION_A, { prompt: '/context-hub:join migration-auth web-1' }),
      deps(),
    )
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/workspaces/migration-auth/join',
        body: { session: 'web-1', repo: 'allovoisins/front' },
      },
    ])
    expect(readState(dataDir, SESSION_A)).toMatchObject({
      workspace: 'migration-auth',
      label: 'web-1',
      repo: 'allovoisins/front',
      repoRoot: ROOT,
      cursor: 49,
    })
    const text = contextOf(output) ?? ''
    expect(text).toContain('<context-hub>')
    expect(text).toContain('Workspace migration-auth : résumé…')
    expect(text).toContain('session="web-1"')
  })

  it('deux sessions du même repo gardent chacune leur état (web-1 / web-2)', async () => {
    await onUserPromptSubmit(
      input(SESSION_A, { prompt: '/context-hub:join migration-auth web-1' }),
      deps(),
    )
    await onUserPromptSubmit(
      input(SESSION_B, { prompt: '/context-hub:join migration-auth web-2' }),
      deps(),
    )
    expect(readState(dataDir, SESSION_A)?.label).toBe('web-1')
    expect(readState(dataDir, SESSION_B)?.label).toBe('web-2')
    expect(readdirSync(join(dataDir, 'sessions')).sort()).toEqual([
      `${SESSION_A}.json`,
      `${SESSION_B}.json`,
    ])
  })

  it('label par défaut : nom du repo + début du session_id', async () => {
    await onUserPromptSubmit(
      input(SESSION_B, { prompt: '/context-hub:join migration-auth' }),
      deps(),
    )
    expect(readState(dataDir, SESSION_B)?.label).toBe('front-bbbb')
  })

  it('refuse des arguments invalides sans appeler le serveur (aucun shell)', async () => {
    const output = await onUserPromptSubmit(
      input(SESSION_A, { prompt: '/context-hub:join migration-auth; rm -rf ~' }),
      deps(),
    )
    expect(calls).toEqual([])
    expect(contextOf(output)).toContain('Usage : /context-hub:join')
    expect(readState(dataDir, SESSION_A)).toBeNull()
  })

  it('403 : message explicite, aucun état écrit', async () => {
    routes.set('POST /api/workspaces/perf-lcp-home/join', () =>
      httpError(403, 'WORKSPACE_FORBIDDEN'),
    )
    const output = await onUserPromptSubmit(
      input(SESSION_A, { prompt: '/context-hub:join perf-lcp-home' }),
      deps(),
    )
    expect(contextOf(output)).toContain('Accès refusé au workspace « perf-lcp-home »')
    expect(readState(dataDir, SESSION_A)).toBeNull()
  })
})

describe('/context-hub:new', () => {
  it('crée le workspace (slug du titre, repo courant) puis le rejoint', async () => {
    routes.set('POST /api/workspaces', () => ok({}))
    routes.set('POST /api/workspaces/paiement-en-3-fois/join', () =>
      ok({ digest: 'résumé', cursor: 2 }),
    )
    const output = await onUserPromptSubmit(
      input(SESSION_A, { prompt: '/context-hub:new "Paiement en 3 fois" web-1' }),
      deps(),
    )
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/workspaces',
      body: {
        title: 'Paiement en 3 fois',
        slug: 'paiement-en-3-fois',
        repos: ['allovoisins/front'],
      },
    })
    expect(readState(dataDir, SESSION_A)).toMatchObject({
      workspace: 'paiement-en-3-fois',
      label: 'web-1',
    })
    expect(contextOf(output)).toContain('/context-hub:join paiement-en-3-fois')
  })

  it('slug déjà pris : message, rien n’est rejoint', async () => {
    routes.set('POST /api/workspaces', () => httpError(422, 'WORKSPACE_RULE'))
    const output = await onUserPromptSubmit(
      input(SESSION_A, { prompt: '/context-hub:new « Migration auth »' }),
      deps(),
    )
    expect(contextOf(output)).toContain('le slug « migration-auth » est déjà pris')
    expect(readState(dataDir, SESSION_A)).toBeNull()
  })
})

describe('prompt ordinaire (delta)', () => {
  beforeEach(() => {
    writeState(dataDir, SESSION_A, joinedState({ label: 'web-1', cursor: 47 }))
  })

  it('injecte le delta attribué, avance le curseur (heartbeat côté serveur)', async () => {
    routes.set('POST /api/workspaces/migration-auth/sync', () =>
      ok({
        text: 'Entrée #47 (décision), écrite par api-1 (Brice)…',
        count: 2,
        nextSeq: 49,
        remaining: 0,
      }),
    )
    const output = await onUserPromptSubmit(input(SESSION_A, { prompt: 'continue' }), deps())
    expect(calls[0]?.body).toEqual({ session: 'web-1', repo: 'allovoisins/front', since: 47 })
    expect(contextOf(output)).toContain('Entrée #47 (décision), écrite par api-1')
    expect(readState(dataDir, SESSION_A)?.cursor).toBe(49)
  })

  it('sans nouvelle entrée : seulement le rappel d’identité', async () => {
    routes.set('POST /api/workspaces/migration-auth/sync', () =>
      ok({ text: 'Aucune nouvelle entrée', count: 0, nextSeq: 47, remaining: 0 }),
    )
    const text = contextOf(
      await onUserPromptSubmit(input(SESSION_A, { prompt: 'continue' }), deps()),
    )
    expect(text).toContain('tu es « web-1 »')
    expect(text).not.toContain('Aucune nouvelle entrée')
  })

  it('workspace fermé (410) : la session est détachée', async () => {
    routes.set('POST /api/workspaces/migration-auth/sync', () => httpError(410, 'WORKSPACE_CLOSED'))
    const output = await onUserPromptSubmit(input(SESSION_A, { prompt: 'continue' }), deps())
    expect(contextOf(output)).toContain('est fermé')
    expect(readState(dataDir, SESSION_A)).toBeNull()
  })

  it('serveur injoignable : avertit sans bloquer, garde le curseur', async () => {
    const output = await onUserPromptSubmit(input(SESSION_A, { prompt: 'continue' }), deps())
    expect(systemMessageOf(output)).toContain('non synchronisées')
    expect(readState(dataDir, SESSION_A)?.cursor).toBe(47)
  })

  it('session non rattachée : rien', async () => {
    expect(await onUserPromptSubmit(input(SESSION_B, { prompt: 'continue' }), deps())).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('/context-hub:status et /context-hub:leave', () => {
  beforeEach(() => {
    writeState(dataDir, SESSION_A, joinedState({ label: 'web-1', cursor: 45 }))
  })

  it('status : mes claims et les entrées non lues', async () => {
    routes.set('GET /api/workspaces/migration-auth', () =>
      ok({
        displayStatus: 'open',
        entryCount: 48,
        participants: [{ active: true }, { active: true }, { active: false }],
        claims: [
          {
            area: 'apps/web/src/auth/**',
            repo: 'allovoisins/front',
            expiresAt: 'x',
            holder: { sessionLabel: 'web-1' },
          },
          {
            area: 'server/api/auth/**',
            repo: 'allovoisins/api',
            expiresAt: 'y',
            holder: { sessionLabel: 'api-1' },
          },
        ],
      }),
    )
    const text = contextOf(
      await onUserPromptSubmit(input(SESSION_A, { prompt: '/context-hub:status' }), deps()),
    )
    expect(text).toContain('2 session(s) active(s) · 2 zone(s) réservée(s)')
    expect(text).toContain('- apps/web/src/auth/** (allovoisins/front)')
    expect(text).not.toContain('- server/api/auth/**')
    expect(text).toContain('Entrées non lues : 4')
  })

  it('leave : libère les zones, oublie l’état, demande une passation', async () => {
    routes.set('POST /api/workspaces/migration-auth/release', () =>
      ok({ claims: [{ area: 'apps/web/src/auth/**' }] }),
    )
    const text = contextOf(
      await onUserPromptSubmit(input(SESSION_A, { prompt: '/context-hub:leave' }), deps()),
    )
    expect(calls[0]?.body).toEqual({ session: 'web-1' })
    expect(readState(dataDir, SESSION_A)).toBeNull()
    expect(text).toContain('1 zone(s) libérée(s) : apps/web/src/auth/**')
    expect(text).toContain('kind="handoff"')
  })
})

describe('PreToolUse', () => {
  const write = (file: string, tool = 'Write') =>
    input(SESSION_B, { tool_name: tool, tool_input: { file_path: file, content: 'x' } })

  beforeEach(() => {
    writeState(dataDir, SESSION_B, joinedState())
  })

  it('bloque une écriture dans la zone d’une autre session, avec détenteur et échéance', async () => {
    routes.set('POST /api/workspaces/migration-auth/check-write', () =>
      ok({
        allowed: false,
        holder: { sessionLabel: 'web-1', userName: 'Brice' },
        claim: {
          area: 'apps/web/src/auth/**',
          repo: 'allovoisins/front',
          expiresAt: '2026-11-23T10:34:00.000Z',
          holder: { sessionLabel: 'web-1', userName: 'Brice' },
        },
      }),
    )
    const output = await onPreToolUse(write(`${ROOT}/apps/web/src/auth/useSession.ts`), deps())
    expect(calls[0]?.body).toEqual({
      repo: 'allovoisins/front',
      path: 'apps/web/src/auth/useSession.ts',
      session: 'web-2',
    })
    expect(output).toMatchObject({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    })
    expect(JSON.stringify(output)).toContain(
      'apps/web/src/auth/useSession.ts est dans la zone apps/web/src/auth/** (allovoisins/front) réservée par la session web-1 (Brice)',
    )
  })

  it('laisse passer une écriture permise', async () => {
    routes.set('POST /api/workspaces/migration-auth/check-write', () =>
      ok({ allowed: true, holder: null, claim: null }),
    )
    expect(await onPreToolUse(write(`${ROOT}/apps/web/src/pages/index.vue`), deps())).toBeNull()
  })

  it('NotebookEdit : chemin dans notebook_path ; chemin relatif résolu depuis cwd', async () => {
    routes.set('POST /api/workspaces/migration-auth/check-write', () => ok({ allowed: true }))
    await onPreToolUse(
      input(SESSION_B, {
        tool_name: 'NotebookEdit',
        tool_input: { notebook_path: 'notes/a.ipynb' },
      }),
      deps(),
    )
    expect(calls[0]?.body).toMatchObject({ path: 'notes/a.ipynb' })
  })

  it('hors du repo de la session, ou session non rattachée : aucun appel', async () => {
    expect(await onPreToolUse(write('/tmp/scratch.txt'), deps())).toBeNull()
    expect(
      await onPreToolUse(
        input(SESSION_A, { tool_name: 'Write', tool_input: { file_path: `${ROOT}/a.ts` } }),
        deps(),
      ),
    ).toBeNull()
    expect(calls).toEqual([])
  })

  it('serveur injoignable : fail-open (avertit) par défaut, fail-closed sur demande', async () => {
    const file = `${ROOT}/apps/web/src/auth/useSession.ts`
    const open = await onPreToolUse(write(file), deps())
    expect(systemMessageOf(open)).toContain('non vérifiée')
    expect(JSON.stringify(open)).not.toContain('deny')
    expect(await onPreToolUse(write(file), deps({ failMode: 'closed' }))).toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    })
  })
})

describe('SessionStart', () => {
  it('session rattachée (reprise, compaction) : réinjecte le résumé', async () => {
    writeState(dataDir, SESSION_A, joinedState({ label: 'web-1' }))
    routes.set('POST /api/workspaces/migration-auth/join', () =>
      ok({ digest: 'Résumé frais', cursor: 52 }),
    )
    const text = contextOf(await onSessionStart(input(SESSION_A, { source: 'resume' }), deps()))
    expect(text).toContain('Résumé frais')
    expect(readState(dataDir, SESSION_A)?.cursor).toBe(52)
  })

  it('session non rattachée : rien', async () => {
    expect(await onSessionStart(input(SESSION_A, { source: 'startup' }), deps())).toBeNull()
  })
})

describe('état de session', () => {
  it('refuse un session_id qui sortirait du dossier de données', () => {
    writeState(dataDir, '../../evil', joinedState())
    expect(readState(dataDir, '../../evil')).toBeNull()
  })
})
