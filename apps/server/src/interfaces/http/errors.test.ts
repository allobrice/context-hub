import { OpenAPIHono } from '@hono/zod-openapi'
import { requestId } from 'hono/request-id'
import { describe, expect, it } from 'vitest'

import { ApiErrorSchema } from '@context-hub/domain/schemas/errors.ts'

import { captureLogger } from '../../test/testApp.ts'
import type { AppEnv } from './env.ts'
import { handleError } from './errors.ts'

describe('handleError', () => {
  it('répond 500 générique et ne journalise que le nom de l’erreur, jamais son message', async () => {
    const { logger, logs } = captureLogger()
    const app = new OpenAPIHono<AppEnv>()
    app.use('*', requestId())
    app.get('/boom', () => {
      throw new TypeError('détail interne : contenu sensible')
    })
    app.onError(handleError(logger))

    const response = await app.request('/boom')
    expect(response.status).toBe(500)
    const body = ApiErrorSchema.parse(await response.json())
    expect(body).toMatchObject({ code: 'INTERNAL', message: 'Erreur interne du serveur.' })
    expect(JSON.stringify(body)).not.toContain('sensible')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      level: 'error',
      event: 'http.unexpected_error',
      fields: { error: 'TypeError', route: '/boom' },
    })
    expect(JSON.stringify(logs)).not.toContain('sensible')
  })
})
