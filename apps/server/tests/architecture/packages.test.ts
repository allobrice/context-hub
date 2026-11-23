/**
 * Garde-fou de la règle entre paquets (CLAUDE.md racine) : le serveur dépend du domaine partagé,
 * jamais du front.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Manifest {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
}

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null
}

const parsed: unknown = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8'),
)
const manifest: Manifest = isManifest(parsed) ? parsed : {}
const workspaceDeps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
  (name) => name.startsWith('@context-hub/'),
)

describe('dépendances de apps/server', () => {
  it('ne visent que le domaine partagé', () => {
    expect(workspaceDeps).toEqual(['@context-hub/domain'])
  })
})
