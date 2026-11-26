/**
 * Concurrence RÉELLE : chaque opération tourne dans un worker avec sa propre connexion SQLite sur un
 * même fichier (WAL), et toutes partent ensemble. Dans un seul thread, better-sqlite3 étant
 * synchrone, des appels « concurrents » s'exécuteraient l'un après l'autre et ne prouveraient rien.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { claimsOverlap } from '@context-hub/domain/workspaces/claims.ts'

import { toUserId } from '../../../application/viewer.ts'
import { failuresOf, runConcurrently } from '../../../test/concurrency/runConcurrently.ts'
import {
  isWorkerResult,
  type WorkerResult,
  type WorkspaceOperation,
} from '../../../test/workspaceWorker.ts'
import { openDatabase } from '../connection.ts'
import { users } from '../schema.ts'
import { DrizzleWorkspaceStore } from './DrizzleWorkspaceStore.ts'

const WORKER = new URL('../../../test/workspaceWorker.ts', import.meta.url)
const AT = '2026-11-23T10:00:00.000Z'
const WORKSPACE_ID = 'ws-concurrency'

let directory: string
let filename: string

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'context-hub-'))
  filename = join(directory, 'concurrency.db')
  const { db, close } = openDatabase(filename)
  db.insert(users).values({ id: 'brice', name: 'Brice' }).run()
  await new DrizzleWorkspaceStore(db).create({
    workspace: {
      id: WORKSPACE_ID,
      slug: 'concurrence',
      title: 'Concurrence',
      goal: '',
      status: 'open',
      repos: ['allovoisins/front'],
      linkedContextIds: [],
      createdBy: 'brice',
      createdAt: AT,
      lastActivityAt: AT,
      closedAt: null,
    },
    creator: toUserId('brice'),
    entry: {
      kind: 'system',
      body: 'Workspace créé.',
      files: [],
      author: { system: 'lifecycle' },
      redactions: 0,
      suspicious: false,
    },
  })
  close()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** Lance les opérations ensemble, chacune dans un worker avec sa connexion. */
function runTogether(operations: readonly WorkspaceOperation[]) {
  return runConcurrently({
    worker: WORKER,
    filename,
    tasks: operations.map((operation) => ({ ...operation, workspaceId: WORKSPACE_ID, at: AT })),
    isResult: isWorkerResult,
  })
}

/** Résultats des workers, une fois vérifié qu'aucun n'a échoué. */
function succeeded(results: Awaited<ReturnType<typeof runTogether>>): WorkerResult[] {
  return results.flatMap((result) => (isWorkerResult(result) ? [result] : []))
}

describe('DrizzleWorkspaceStore en concurrence (workers, une connexion chacun)', () => {
  it('10 claims concurrents sur des zones qui se chevauchent : exactement 1 réussit', async () => {
    const areas = [
      'apps/web/**',
      'apps/web/src/**',
      'apps/web/src/auth/**',
      'apps/web/src/auth/useSession.ts',
      'apps/web/src/*.ts',
      'apps/**',
      '**/*.ts',
      'apps/web/src/auth/*.ts',
      'apps/web/src/a*/**',
      'apps/web/src/auth/use*',
    ]
    // Toutes les zones se chevauchent DEUX À DEUX (préfixes statiques en chaîne : '', 'apps/',
    // 'apps/web/', 'apps/web/src/', 'apps/web/src/a', 'apps/web/src/auth/', …/use, …/useSession.ts) :
    // quel que soit le gagnant, les neuf autres sont en conflit.
    expect(
      areas.every((a) =>
        areas.every((b) => claimsOverlap({ repo: 'r/r', area: a }, { repo: 'r/r', area: b })),
      ),
    ).toBe(true)
    const results = await runTogether(
      areas.map((area, index) => ({ kind: 'claim', session: `web-${index + 1}`, area })),
    )
    expect(failuresOf(results)).toEqual([])
    const outcomes = succeeded(results).map((result) =>
      result.kind === 'claim' ? result.outcome : 'other',
    )
    expect(outcomes.filter((outcome) => outcome === 'acquired')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome === 'conflict')).toHaveLength(9)
  }, 120_000)

  // 10 connexions × 5 écritures = 50 entrées concurrentes (50 workers chargeant chacun tsx
  // démarreraient trop lentement ; la concurrence vient des connexions, pas du nombre de workers).
  it('50 entrées concurrentes : seq exactement 2..51 (après #1), sans trou ni doublon', async () => {
    const results = await runTogether(
      Array.from({ length: 10 }, (_, index) => ({
        kind: 'post',
        session: `s-${index + 1}`,
        count: 5,
      })),
    )
    expect(failuresOf(results)).toEqual([])
    const seqs = succeeded(results).flatMap((result) => (result.kind === 'post' ? result.seqs : []))
    expect([...seqs].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 2))
  }, 120_000)

  it('lecture par curseur pendant les écritures : aucune entrée perdue ni dupliquée', async () => {
    const writers: WorkspaceOperation[] = Array.from({ length: 5 }, (_, index) => ({
      kind: 'post',
      session: `w-${index + 1}`,
      count: 20,
    }))
    const results = await runTogether([
      ...writers,
      { kind: 'read', expected: 101, pageSize: 7 },
      { kind: 'read', expected: 101, pageSize: 3 },
    ])
    expect(failuresOf(results)).toEqual([])
    const all = Array.from({ length: 101 }, (_, i) => i + 1)
    for (const result of succeeded(results)) {
      if (result.kind === 'read') expect(result.seqs).toEqual(all)
    }
  }, 120_000)
})
