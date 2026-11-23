/**
 * Garde-fou de la règle de dépendance entre couches (CLAUDE.md).
 * Lint des fichiers virtuels avec la politique exportée par eslint.config.js :
 * un import interdit doit produire une erreur `boundaries/dependencies`.
 */
// @vitest-environment node
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
const WEB = 'apps/web/src'
const DOMAIN = 'packages/domain/src'

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

describe('règle de dépendance entre couches', () => {
  it.each([
    ['domain → ui', `${DOMAIN}/probe.ts`, '../../../apps/web/src/ui/app/App.tsx'],
    ['application → ui', `${WEB}/application/probe.ts`, '../ui/app/App.tsx'],
    ['infrastructure → ui', `${WEB}/infrastructure/probe.ts`, '../ui/app/App.tsx'],
    ['ui → point d’assemblage', `${WEB}/ui/probe.ts`, '../main.tsx'],
    [
      'test de ui → infrastructure',
      `${WEB}/ui/probe.test.tsx`,
      '../infrastructure/createInMemoryServices.ts',
    ],
    ['code de ui → support de test', `${WEB}/ui/probe.ts`, '../test/renderApp.tsx'],
    // Prouve que main.tsx est bien classé : un fichier non classé ne serait pas contrôlé.
    ['point d’assemblage → support de test', `${WEB}/main.tsx`, './test/setup.ts'],
  ])('interdit %s', async (_, file, target) => {
    expect(await violations(file, target)).toContain('boundaries/dependencies')
  })

  it.each([
    ['ui → domain (paquet)', `${WEB}/ui/probe.ts`, '@context-hub/domain/context/types.ts'],
    [
      'application → domain (paquet)',
      `${WEB}/application/probe.ts`,
      '@context-hub/domain/context/types.ts',
    ],
    ['domain → domain', `${DOMAIN}/probe.ts`, './context/types.ts'],
    ['point d’assemblage → ui', `${WEB}/main.tsx`, './ui/app/App.tsx'],
    ['test de ui → support de test', `${WEB}/ui/probe.test.tsx`, '../test/renderApp.tsx'],
  ])('autorise %s', async (_, file, target) => {
    expect(await violations(file, target)).toEqual([])
  })
})
