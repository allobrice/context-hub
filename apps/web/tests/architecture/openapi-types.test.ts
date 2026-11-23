/**
 * Les types du client HTTP (`src/infrastructure/http/openapi.d.ts`) sont générés depuis le contrat
 * commité du serveur (`apps/server/openapi.json`). En cas d'échec :
 * `pnpm --filter @context-hub/server openapi:export && pnpm --filter @context-hub/web api:generate`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import openapiTS, { astToString } from 'openapi-typescript'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')
const CONTRACT = join(ROOT, '../server/openapi.json')
const GENERATED = join(ROOT, 'src/infrastructure/http/openapi.d.ts')

describe('types générés du contrat OpenAPI', () => {
  it('sont à jour avec apps/server/openapi.json', async () => {
    const expected = astToString(await openapiTS(readFileSync(CONTRACT, 'utf8')))
    expect(readFileSync(GENERATED, 'utf8').endsWith(expected)).toBe(true)
  })
})
