/**
 * Garde-fou de la règle de dépendance entre couches (CLAUDE.md).
 * Lint des fichiers virtuels avec la politique exportée par eslint.config.js :
 * un import interdit doit produire une erreur `boundaries/dependencies`.
 */
// @vitest-environment node
import { ESLint } from 'eslint'
import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import { LAYER_ELEMENTS, LAYER_FILES, LAYER_POLICIES } from '../../eslint.config.js'

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: tseslint.parser },
      plugins: { boundaries },
      settings: {
        'boundaries/elements': LAYER_ELEMENTS,
        'boundaries/files': LAYER_FILES,
        'boundaries/include': ['src/**/*'],
        'import/resolver': { typescript: { project: './tsconfig.app.json' } },
      },
      rules: { 'boundaries/dependencies': ['error', LAYER_POLICIES] },
    },
  ],
})

async function violations(filePath: string, importPath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`import '${importPath}'\n`, { filePath })
  return (result?.messages ?? []).map((message) => message.ruleId ?? message.message)
}

describe('règle de dépendance entre couches', () => {
  it.each([
    ['domain → ui', 'src/domain/probe.ts', '../ui/app/App.tsx'],
    ['application → ui', 'src/application/probe.ts', '../ui/app/App.tsx'],
    ['infrastructure → ui', 'src/infrastructure/probe.ts', '../ui/app/App.tsx'],
    ['ui → point d’assemblage', 'src/ui/probe.ts', '../main.tsx'],
    [
      'test de ui → infrastructure',
      'src/ui/probe.test.tsx',
      '../infrastructure/createInMemoryServices.ts',
    ],
    ['code de ui → support de test', 'src/ui/probe.ts', '../test/renderApp.tsx'],
    // Prouve que main.tsx est bien classé : un fichier non classé ne serait pas contrôlé.
    ['point d’assemblage → support de test', 'src/main.tsx', './test/setup.ts'],
  ])('interdit %s', async (_, file, target) => {
    expect(await violations(file, target)).toContain('boundaries/dependencies')
  })

  it.each([
    ['ui → domain', 'src/ui/probe.ts', '../domain/context/types.ts'],
    ['domain → domain', 'src/domain/probe.ts', './context/types.ts'],
    ['point d’assemblage → ui', 'src/main.tsx', './ui/app/App.tsx'],
    ['test de ui → support de test', 'src/ui/probe.test.tsx', '../test/renderApp.tsx'],
  ])('autorise %s', async (_, file, target) => {
    expect(await violations(file, target)).toEqual([])
  })
})
