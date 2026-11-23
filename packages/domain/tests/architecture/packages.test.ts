/**
 * Garde-fou de la règle entre paquets (CLAUDE.md racine) : `packages/domain` ne dépend d'aucun
 * paquet du workspace, et sa seule dépendance externe autorisée est Zod (schémas partagés).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Manifest {
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
}

function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null
}

const ALLOWED_RUNTIME_DEPENDENCIES = new Set(['zod'])

const parsed: unknown = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8'),
)
const manifest: Manifest = isManifest(parsed) ? parsed : {}
const runtimeDeps = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })

describe('dépendances de packages/domain', () => {
  it('ne visent aucun paquet du workspace', () => {
    expect(runtimeDeps.filter((name) => name.startsWith('@context-hub/'))).toEqual([])
  })

  it('se limitent à Zod', () => {
    expect(runtimeDeps.filter((name) => !ALLOWED_RUNTIME_DEPENDENCIES.has(name))).toEqual([])
  })
})
