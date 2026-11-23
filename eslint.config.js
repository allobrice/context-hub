import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import boundaries from 'eslint-plugin-boundaries'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Racine du monorepo : les motifs ci-dessous sont relatifs à ce dossier, quel que soit le cwd du lint. */
const ROOT = import.meta.dirname
const WEB = 'apps/web'
const SERVER = 'apps/server'

/**
 * Couches du front (voir CLAUDE.md) : ui → application → domain ; infrastructure implémente les ports
 * d'application. Le domaine est le paquet `packages/domain` (`@context-hub/domain`).
 * `apps/web/src/main.tsx` est le point d'assemblage : seul fichier autorisé à importer infrastructure ET ui.
 */
export const LAYER_ELEMENTS = [
  { type: 'domain', pattern: 'packages/domain/src' },
  { type: 'application', pattern: `${WEB}/src/application` },
  { type: 'infrastructure', pattern: `${WEB}/src/infrastructure` },
  { type: 'ui', pattern: `${WEB}/src/ui` },
  { type: 'test-support', pattern: `${WEB}/src/test` },
  // Serveur : interfaces (http, mcp) → application → domain ; infrastructure implémente les ports.
  { type: 'server-application', pattern: `${SERVER}/src/application` },
  { type: 'server-infrastructure', pattern: `${SERVER}/src/infrastructure` },
  { type: 'server-interfaces', pattern: `${SERVER}/src/interfaces` },
  { type: 'server-test-support', pattern: `${SERVER}/src/test` },
]

/** `main.tsx` est un fichier, pas un dossier : il est classé par un file descriptor. */
export const LAYER_FILES = [
  { pattern: `${WEB}/src/main.tsx`, category: 'composition-root' },
  { pattern: `${WEB}/src/**/*.test.{ts,tsx}`, category: 'test' },
  // Points d'assemblage du serveur : démarrage, composition partagée, CLI.
  {
    pattern: [`${SERVER}/src/{main,composition}.ts`, `${SERVER}/src/cli/**/*.ts`],
    category: 'server-composition-root',
  },
  { pattern: `${SERVER}/src/**/*.test.ts`, category: 'server-test' },
]

/** Fichiers soumis à la règle de couches, et tsconfig servant à résoudre leurs imports. */
export const LAYER_INCLUDE = [`${WEB}/src/**/*`, `${SERVER}/src/**/*`, 'packages/domain/src/**/*']
export const LAYER_TSCONFIGS = [
  `${ROOT}/${WEB}/tsconfig.app.json`,
  `${ROOT}/${SERVER}/tsconfig.app.json`,
  `${ROOT}/packages/domain/tsconfig.lib.json`,
]

/**
 * Règle de dépendance entre paquets : `apps/*` → `packages/domain` ; `packages/domain` ne dépend
 * d'aucun paquet du workspace ; aucune app n'importe une autre app.
 */
const DOMAIN_PACKAGE_RESTRICTIONS = [
  {
    group: ['@context-hub/*', '**/apps/**'],
    message: 'packages/domain ne dépend d’aucun paquet du workspace.',
  },
  {
    group: [
      'react',
      'react-*',
      'react/*',
      '@tanstack/*',
      'node:*',
      'hono',
      'hono/*',
      'drizzle-orm*',
    ],
    message: 'packages/domain est du TS pur, sans framework ni API Node.',
  },
]

const APP_PACKAGE_RESTRICTIONS = [
  {
    group: ['@context-hub/server', '@context-hub/web'],
    message: 'Une app n’importe jamais une autre app.',
  },
  {
    group: ['**/apps/server/**', '**/apps/web/**', '**/packages/domain/**'],
    message:
      'Passer par le paquet (@context-hub/domain/…), jamais par un chemin relatif vers un autre paquet.',
  },
]

const COMMON_RESTRICTED_IMPORTS = {
  paths: [{ name: 'rehype-raw', message: 'Interdit : contenu non fiable (CLAUDE.md).' }],
  patterns: [{ group: ['**/design-kit/**'], message: 'design-kit/ ne doit pas être importé.' }],
}

const SERVER_LAYERS = [
  'server-application',
  'server-infrastructure',
  'server-interfaces',
  'server-test-support',
]

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
    // Un test peut utiliser le support de test (src/test/), qui seul assemble l'infrastructure in-memory.
    {
      from: { file: { categories: 'test' } },
      allow: { to: { element: { type: 'test-support' } } },
    },
    {
      from: { element: { type: 'server-application' } },
      allow: { to: { element: { types: ['server-application', 'domain'] } } },
    },
    {
      from: { element: { type: 'server-infrastructure' } },
      allow: {
        to: { element: { types: ['server-infrastructure', 'server-application', 'domain'] } },
      },
    },
    {
      from: { element: { type: 'server-interfaces' } },
      allow: { to: { element: { types: ['server-interfaces', 'server-application', 'domain'] } } },
    },
    {
      from: { element: { type: 'server-test-support' } },
      allow: { to: { element: { types: [...SERVER_LAYERS, 'domain'] } } },
    },
    // Le support de test réutilise le câblage de composition.ts (un seul câblage).
    {
      from: { element: { type: 'server-test-support' } },
      allow: { to: { file: { categories: 'server-composition-root' } } },
    },
    // Un test serveur peut utiliser src/test/, qui seul assemble l'infrastructure (base en mémoire).
    {
      from: { file: { categories: 'server-test' } },
      allow: { to: { element: { type: 'server-test-support' } } },
    },
    {
      from: { file: { categories: 'server-composition-root' } },
      allow: { to: { element: { types: [...SERVER_LAYERS, 'domain'] } } },
    },
    {
      from: { file: { categories: 'server-composition-root' } },
      allow: { to: { file: { categories: 'server-composition-root' } } },
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
      parserOptions: {
        projectService: true,
        tsconfigRootDir: ROOT,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-syntax': ['error', ...FORBIDDEN_UNSAFE_HTML],
      'no-restricted-imports': ['error', COMMON_RESTRICTED_IMPORTS],
    },
  },

  {
    files: [`${WEB}/src/**/*.{ts,tsx}`, `${SERVER}/src/**/*.ts`, 'packages/domain/src/**/*.ts'],
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
    rules: {
      'boundaries/dependencies': ['error', LAYER_POLICIES],
    },
  },

  {
    files: ['apps/*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...COMMON_RESTRICTED_IMPORTS,
          patterns: [...COMMON_RESTRICTED_IMPORTS.patterns, ...APP_PACKAGE_RESTRICTIONS],
        },
      ],
    },
  },

  {
    files: [`${WEB}/src/**/*.{ts,tsx}`],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      // Pattern APG : un tabpanel est focusable pour être atteint au clavier.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel'], allowExpressionValues: true },
      ],
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },

  {
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...COMMON_RESTRICTED_IMPORTS,
          patterns: [...COMMON_RESTRICTED_IMPORTS.patterns, ...DOMAIN_PACKAGE_RESTRICTIONS],
        },
      ],
    },
  },

  {
    files: [
      '*.{js,ts}',
      '{apps,packages}/*/*.{js,ts}',
      '{apps,packages}/*/tests/**/*.ts',
      `${SERVER}/src/**/*.ts`,
    ],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
)
