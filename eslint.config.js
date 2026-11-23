import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import boundaries from 'eslint-plugin-boundaries'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Couches (voir CLAUDE.md) : ui → application → domain ; infrastructure implémente les ports d'application.
 * `src/main.tsx` est le point d'assemblage : seul fichier autorisé à importer infrastructure ET ui.
 */
export const LAYER_ELEMENTS = [
  { type: 'domain', pattern: 'src/domain' },
  { type: 'application', pattern: 'src/application' },
  { type: 'infrastructure', pattern: 'src/infrastructure' },
  { type: 'ui', pattern: 'src/ui' },
  { type: 'test-support', pattern: 'src/test' },
]

/** `src/main.tsx` est un fichier, pas un dossier : il est classé par un file descriptor. */
export const LAYER_FILES = [{ pattern: 'src/main.tsx', category: 'composition-root' }]

export const LAYER_POLICIES = {
  default: 'disallow',
  policies: [
    { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
    {
      from: { element: { type: 'application' } },
      allow: { to: { element: { types: ['application', 'domain'] } } },
    },
    {
      from: { element: { type: 'infrastructure' } },
      allow: { to: { element: { types: ['infrastructure', 'application', 'domain'] } } },
    },
    {
      from: { element: { type: 'ui' } },
      allow: { to: { element: { types: ['ui', 'application', 'domain'] } } },
    },
    {
      from: { element: { type: 'test-support' } },
      allow: {
        to: {
          element: { types: ['test-support', 'ui', 'application', 'domain', 'infrastructure'] },
        },
      },
    },
    {
      from: { file: { categories: 'composition-root' } },
      allow: { to: { element: { types: ['ui', 'application', 'infrastructure', 'domain'] } } },
    },
  ],
}

const FORBIDDEN_UNSAFE_HTML = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'Interdit : le contenu d’un contexte est une donnée non fiable (CLAUDE.md).',
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: 'Interdit : le contenu d’un contexte est une donnée non fiable (CLAUDE.md).',
  },
]

export default tseslint.config(
  { ignores: ['design-kit/**', 'dist/**', 'coverage/**', 'node_modules/**'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-syntax': ['error', ...FORBIDDEN_UNSAFE_HTML],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'rehype-raw', message: 'Interdit : contenu non fiable (CLAUDE.md).' }],
          patterns: [
            { group: ['**/design-kit/**'], message: 'design-kit/ ne doit pas être importé.' },
          ],
        },
      ],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      boundaries,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      'boundaries/elements': LAYER_ELEMENTS,
      'boundaries/files': LAYER_FILES,
      'boundaries/include': ['src/**/*'],
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      'boundaries/dependencies': ['error', LAYER_POLICIES],
    },
  },

  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react/*', '@tanstack/*'],
              message: 'domain/ est du TS pur, sans React.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['*.{js,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
)
