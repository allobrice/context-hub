/**
 * Garde-fou de la règle de couches du serveur (apps/server/CLAUDE.md), avec la politique exportée
 * par l'eslint.config.js racine : un import interdit produit une erreur `boundaries/dependencies`.
 */
import { join } from 'node:path'

import { ESLint } from 'eslint'
import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import {
  LAYER_ELEMENTS,
  LAYER_FILES,
  LAYER_INCLUDE,
  LAYER_POLICIES,
  LAYER_TSCONFIGS,
} from '../../../../eslint.config.js'

const ROOT = join(import.meta.dirname, '../../../..')
const SERVER = 'apps/server/src'

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: tseslint.parser },
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': ROOT,
        'boundaries/elements': LAYER_ELEMENTS,
        'boundaries/files': LAYER_FILES,
        'boundaries/include': LAYER_INCLUDE,
        'import/resolver': {
          typescript: { project: LAYER_TSCONFIGS, noWarnOnMultipleProjects: true },
        },
      },
      rules: { 'boundaries/dependencies': ['error', LAYER_POLICIES] },
    },
  ],
})

async function violations(filePath: string, importPath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`import '${importPath}'\n`, {
    filePath: join(ROOT, filePath),
  })
  return (result?.messages ?? []).map((message) => message.ruleId ?? message.message)
}

describe('règle de couches du serveur', () => {
  it.each([
    [
      'application → infrastructure',
      `${SERVER}/application/probe.ts`,
      '../infrastructure/db/connection.ts',
    ],
    [
      'interfaces → infrastructure',
      `${SERVER}/interfaces/probe.ts`,
      '../infrastructure/db/schema.ts',
    ],
    [
      'code serveur → support de test',
      `${SERVER}/infrastructure/probe.ts`,
      '../test/testDatabase.ts',
    ],
    ['web → serveur', 'apps/web/src/ui/probe.ts', '../../../server/src/application/viewer.ts'],
  ])('interdit %s', async (_, file, target) => {
    expect(await violations(file, target)).toContain('boundaries/dependencies')
  })

  it.each([
    [
      'application → domain (paquet)',
      `${SERVER}/application/probe.ts`,
      '@context-hub/domain/context/types.ts',
    ],
    [
      'infrastructure → application',
      `${SERVER}/infrastructure/probe.ts`,
      '../application/viewer.ts',
    ],
    ['interfaces → application', `${SERVER}/interfaces/probe.ts`, '../application/viewer.ts'],
    ['test → support de test', `${SERVER}/infrastructure/probe.test.ts`, '../test/testDatabase.ts'],
    [
      'point d’assemblage → infrastructure',
      `${SERVER}/main.ts`,
      './infrastructure/db/connection.ts',
    ],
  ])('autorise %s', async (_, file, target) => {
    expect(await violations(file, target)).toEqual([])
  })
})
