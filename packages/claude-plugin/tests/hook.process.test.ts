/**
 * `scripts/hook.mjs` lancé comme le fait Claude Code : `node hook.mjs <événement>`, entrée JSON sur
 * stdin, sortie sur stdout, contre un petit serveur HTTP de test (et contre un serveur absent).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeState } from '../scripts/lib/state.mjs'

const HOOK = join(import.meta.dirname, '../scripts/hook.mjs')
const SESSION = 'cccc3333-0000-4000-8000-000000000003'
const ROOT = '/home/dev/front'

let dataDir: string
let server: Server | null
let received: { path: string; authorization: string | undefined; body: string }[]

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'context-hub-hook-'))
  server = null
  received = []
  writeState(dataDir, SESSION, {
    version: 1,
    workspace: 'migration-auth',
    label: 'web-2',
    repo: 'allovoisins/front',
    repoRoot: ROOT,
    cursor: 49,
    joinedAt: '2026-11-23T10:00:00.000Z',
  })
})

afterEach(async () => {
  rmSync(dataDir, { recursive: true, force: true })
  const current = server
  if (current) await new Promise((resolve) => current.close(resolve))
})

/** Serveur de test : `check-write` refuse tout fichier de `apps/web/src/auth/`. */
async function startServer(): Promise<string> {
  const current = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString()))
    request.on('end', () => {
      received.push({ path: request.url ?? '', authorization: request.headers.authorization, body })
      const blocked = body.includes('apps/web/src/auth/')
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify(
          blocked
            ? {
                allowed: false,
                holder: { sessionLabel: 'web-1', userName: 'Brice' },
                claim: {
                  area: 'apps/web/src/auth/**',
                  repo: 'allovoisins/front',
                  expiresAt: '2026-11-23T10:34:00.000Z',
                  holder: { sessionLabel: 'web-1', userName: 'Brice' },
                },
              }
            : { allowed: true, holder: null, claim: null },
        ),
      )
    })
  })
  server = current
  await new Promise<void>((resolve) => current.listen(0, '127.0.0.1', resolve))
  const address = current.address()
  if (address === null || typeof address === 'string') throw new Error('adresse inattendue')
  return `http://127.0.0.1:${address.port}`
}

function runHook(event: string, stdin: string, env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, event], {
      env: { PATH: process.env.PATH ?? '', CLAUDE_PLUGIN_DATA: dataDir, ...env },
    })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code, stdout })
    })
    child.stdin.end(stdin)
  })
}

const preToolUse = (file: string) =>
  JSON.stringify({
    session_id: SESSION,
    cwd: ROOT,
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: file, old_string: 'a', new_string: 'b' },
  })

describe('hook.mjs (processus)', () => {
  it('PreToolUse : refus JSON sur stdout, code 0, jeton envoyé', async () => {
    const url = await startServer()
    const { code, stdout } = await runHook(
      'PreToolUse',
      preToolUse(`${ROOT}/apps/web/src/auth/useSession.ts`),
      {
        CONTEXT_HUB_URL: url,
        CONTEXT_HUB_TOKEN: 'chub_test',
      },
    )
    expect(code).toBe(0)
    const output: unknown = JSON.parse(stdout)
    expect(output).toMatchObject({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    })
    expect(received[0]).toMatchObject({
      path: '/api/workspaces/migration-auth/check-write',
      authorization: 'Bearer chub_test',
    })
  })

  it('PreToolUse permis : aucune sortie', async () => {
    const url = await startServer()
    const { code, stdout } = await runHook('PreToolUse', preToolUse(`${ROOT}/README.md`), {
      CONTEXT_HUB_URL: url,
      CONTEXT_HUB_TOKEN: 'chub_test',
    })
    expect(code).toBe(0)
    expect(stdout).toBe('')
  })

  it('serveur absent : fail-open (avertissement, pas de refus) en moins de 5 s', async () => {
    const start = Date.now()
    const { code, stdout } = await runHook(
      'PreToolUse',
      preToolUse(`${ROOT}/apps/web/src/auth/a.ts`),
      {
        CONTEXT_HUB_URL: 'http://127.0.0.1:59999',
        CONTEXT_HUB_TOKEN: 'chub_test',
      },
    )
    expect(code).toBe(0)
    expect(stdout).toContain(
      '"systemMessage":"context-hub : écriture de apps/web/src/auth/a.ts non vérifiée',
    )
    expect(stdout).not.toContain('deny')
    expect(stdout).toContain('connexion refusée')
    expect(Date.now() - start).toBeLessThan(5000)
  })

  it('entrée illisible ou événement inconnu : code 0, aucune sortie', async () => {
    expect(await runHook('PreToolUse', 'pas du json', {})).toEqual({ code: 0, stdout: '' })
    expect(await runHook('Stop', preToolUse('/x'), {})).toEqual({ code: 0, stdout: '' })
  })
})
