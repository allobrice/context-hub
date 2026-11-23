import { describe, expect, it } from 'vitest'

import { DraftRejectedError, VersionConflictError } from '@context-hub/domain/shared/errors.ts'

import { RepositoryUnavailableError, UnauthorizedError } from '../../application/errors.ts'
import { createApiClient, unwrap } from './apiClient.ts'

function clientAnswering(status: number, body: unknown, headers: Record<string, string> = {}) {
  return createApiClient({
    baseUrl: 'http://api.test',
    fetch: () =>
      Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json', ...headers },
        }),
      ),
  })
}

const getWorkspace = (status: number, body: unknown, headers?: Record<string, string>) =>
  unwrap(clientAnswering(status, body, headers).GET('/api/workspace'))

describe('unwrap : traduction des réponses de l’API', () => {
  it('401 → UnauthorizedError', async () => {
    await expect(
      getWorkspace(401, { code: 'UNAUTHORIZED', message: 'Jeton absent' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('409 → VersionConflictError avec la version publiée entre-temps', async () => {
    const latest = {
      number: 5,
      author: 'Camille',
      createdAt: '2026-11-23T10:00:00Z',
      content: '# v5',
    }
    const error = getWorkspace(409, {
      code: 'VERSION_CONFLICT',
      message: 'Conflit',
      details: { baseVersion: 4, latestVersion: 5, latest },
    })
    await expect(error).rejects.toBeInstanceOf(VersionConflictError)
    await expect(error).rejects.toMatchObject({ baseVersion: 4, latestVersion: 5, latest })
  })

  it('422 → DraftRejectedError avec les findings du serveur', async () => {
    const findings = [{ kind: 'secret', line: 3, pattern: 'ghp_', label: 'jeton GitHub' }]
    const error = getWorkspace(422, {
      code: 'DRAFT_REJECTED',
      message: 'Refusé',
      details: { reasons: ['secret-detected'], findings },
    })
    await expect(error).rejects.toBeInstanceOf(DraftRejectedError)
    await expect(error).rejects.toMatchObject({ reasons: ['secret-detected'], findings })
  })

  it('500 → RepositoryUnavailableError avec le code HTTP et l’identifiant de requête', async () => {
    const error = getWorkspace(
      500,
      { code: 'INTERNAL', message: 'Erreur interne', details: { requestId: 'abcdef123456' } },
      { 'X-Request-Id': 'abcdef123456' },
    )
    await expect(error).rejects.toBeInstanceOf(RepositoryUnavailableError)
    await expect(error).rejects.toMatchObject({ code: 'HTTP 500', requestId: 'abcdef12' })
  })

  it('un corps d’erreur mal formé reste une erreur technique', async () => {
    await expect(
      getWorkspace(404, { code: 'NOT_FOUND', message: 'Introuvable' }),
    ).rejects.toBeInstanceOf(RepositoryUnavailableError)
  })

  it('serveur injoignable → RepositoryUnavailableError NETWORK', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    })
    await expect(unwrap(client.GET('/api/workspace'))).rejects.toMatchObject({
      code: 'NETWORK',
      detail: 'fetch failed',
    })
  })
})
