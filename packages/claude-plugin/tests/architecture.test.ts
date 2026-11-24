/**
 * Les scripts du plugin s'exécutent tels quels dans les repos des utilisateurs : aucune dépendance
 * installée, uniquement des modules `node:` et des imports relatifs.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

function scripts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? scripts(join(directory, entry.name))
      : entry.name.endsWith('.mjs')
        ? [join(directory, entry.name)]
        : [],
  )
}

describe('architecture du plugin', () => {
  it('n’a aucune dépendance d’exécution', () => {
    const manifest: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(manifest).not.toHaveProperty('dependencies')
    expect(manifest).not.toHaveProperty('peerDependencies')
  })

  it('n’importe que des modules node: ou des fichiers relatifs', () => {
    const offenders = scripts(join(ROOT, 'scripts')).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)]
        .map((match) => match[1] ?? '')
        .filter(
          (specifier) =>
            !specifier.startsWith('node:') &&
            !specifier.startsWith('./') &&
            !specifier.startsWith('../'),
        )
        .map((specifier) => `${file}: ${specifier}`),
    )
    expect(offenders).toEqual([])
  })
})
