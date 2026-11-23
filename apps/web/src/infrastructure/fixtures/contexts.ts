import type {
  Context,
  ContextStatus,
  ContextVersion,
  Scope,
} from '@context-hub/domain/context/types.ts'
import { toContextId } from '@context-hub/domain/context/types.ts'

/**
 * Données de démo (SPEC §6). Les 8 premiers contextes sont ceux des maquettes, repris tels quels ;
 * les 34 suivants complètent la bibliothèque pour que TOUS les compteurs visibles dans les maquettes
 * soient exacts (vérifié par contexts.test.ts) : statuts, collections, portées, tags, impact de fusion.
 */

export interface ContextRecord {
  readonly context: Context
  /** Versions publiées, de la plus récente à la plus ancienne (immuables). */
  readonly history: readonly ContextVersion[]
}

const TEAM: Scope = { kind: 'team', team: 'allovoisins' }
const FRONT: Scope = { kind: 'project', repo: 'allovoisins/front' }
const API: Scope = { kind: 'project', repo: 'allovoisins/api' }
const BRICE: Scope = { kind: 'personal', owner: 'brice' }

interface Spec {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly description: string
  readonly collectionId: string | null
  readonly tags: readonly string[]
  readonly scope: Scope
  readonly status: ContextStatus
  /** Numéro de la version courante (publiée, ou brouillon si jamais publié). */
  readonly version: number
  readonly tokens: number
  readonly updatedAt: string
  readonly createdAt?: string
  readonly author?: string
  readonly reads?: number
  readonly content?: string
  readonly note?: string
}

function defaultContent({ title, description, tags }: Spec): string {
  return [
    `# ${title}`,
    '',
    description,
    '',
    '## Points clés',
    '',
    ...tags.map((tag) => `- Concerne \`${tag}\`.`),
  ].join('\n')
}

function build(
  spec: Spec,
  extra: { draft?: ContextVersion; history?: readonly ContextVersion[] } = {},
): ContextRecord {
  const author = spec.author ?? 'Brice'
  const version: ContextVersion = {
    number: spec.version,
    content: spec.content ?? defaultContent(spec),
    note: spec.note ?? (spec.version === 1 ? 'Version initiale' : 'Mise à jour'),
    author,
    createdAt: spec.updatedAt,
    tokenEstimate: spec.tokens,
  }
  const isPublished = spec.status !== 'draft'
  const context: Context = {
    id: toContextId(spec.id),
    slug: spec.slug,
    title: spec.title,
    description: spec.description,
    collectionId: spec.collectionId,
    tags: spec.tags,
    scope: spec.scope,
    status: spec.status,
    publishedVersion: isPublished ? version : null,
    draft: isPublished ? (extra.draft ?? null) : version,
    createdAt: spec.createdAt ?? '2026-03-02T10:00:00+01:00',
    updatedAt: spec.updatedAt,
    author,
    mcpReads7d: spec.reads ?? 0,
  }
  return { context, history: extra.history ?? (isPublished ? [version] : []) }
}

/** Contenu publié v4 de « Conventions Nuxt 4 » (maquette 08). */
const NUXT4_V4_CONTENT = `# Conventions Nuxt 4

Règles appliquées sur les projets Nuxt 4 d’AlloVoisins. À suivre pour tout nouveau code ; le code existant est migré au fil de l’eau.

## Structure

- Le code applicatif vit dans \`app/\` : \`pages/\`, \`components/\`, \`composables/\`, \`layouts/\`.
- Le code partagé client/serveur va dans \`shared/\`, jamais dans \`server/\`.
- Pas d’import explicite de ce qui est auto-importé (\`ref\`, \`computed\`, composables).

## Data fetching

- \`useFetch\` pour un appel simple à une route \`server/api\`.
- \`useAsyncData\` avec une **clé explicite et stable** dès qu’on compose plusieurs appels.

\`\`\`ts
const { data: offers, status } = await useAsyncData(
  \`offers:\${categoryId}\`,
  () => $fetch('/api/offers', { query: { categoryId } })
)
\`\`\`

## Composables

- Préfixe \`use\`, un composable par fichier, retour typé explicitement.
- Aucun accès à \`window\` hors \`onMounted\` ou garde \`import.meta.client\`.
`

/**
 * Brouillon v5 (maquette 12). Contient VOLONTAIREMENT un faux secret (ligne 15) pour démontrer
 * le scan (SPEC §6). Valeur factice, trop courte pour un vrai jeton.
 */
const NUXT4_V5_CONTENT = `# Conventions Nuxt 4

Règles appliquées sur les projets Nuxt 4 d’AlloVoisins.

## Data fetching

- \`useFetch\` pour un appel simple à une route \`server/api\`.
- \`useAsyncData\` avec une **clé explicite et stable**.

## Routes server/

- Une route par fichier, validation des entrées avec \`zod\`.
- Les clés d’API se lisent via \`useRuntimeConfig()\`.

  NUXT_API_KEY=sk_live_51HxDEMOonly3kQ

## Composables

- Préfixe \`use\`, un composable par fichier, retour typé.
`

const NUXT4_HISTORY: readonly ContextVersion[] = [
  {
    number: 4,
    content: NUXT4_V4_CONTENT,
    note: 'useAsyncData : clés explicites',
    author: 'Brice',
    createdAt: '2026-11-23T09:12:00+01:00',
    tokenEstimate: 2140,
  },
  {
    number: 3,
    content: NUXT4_V4_CONTENT,
    note: 'Dossier shared/ pour le code isomorphe',
    author: 'Camille',
    createdAt: '2026-11-14T16:40:00+01:00',
    tokenEstimate: 1980,
  },
  {
    number: 2,
    content: NUXT4_V4_CONTENT,
    note: 'Règles de nommage des composables',
    author: 'Brice',
    createdAt: '2026-10-02T11:05:00+02:00',
    tokenEstimate: 1720,
  },
  {
    number: 1,
    content: NUXT4_V4_CONTENT,
    note: 'Version initiale',
    author: 'Brice',
    createdAt: '2026-09-03T10:21:00+02:00',
    tokenEstimate: 1210,
  },
]

const NUXT4_DRAFT: ContextVersion = {
  number: 5,
  content: NUXT4_V5_CONTENT,
  note: 'Ajout section routes server/',
  author: 'Brice',
  createdAt: '2026-11-23T10:52:00+01:00',
  tokenEstimate: 2310,
}

export const NUXT4_CONTEXT_ID = toContextId('ctx-nuxt-conventions')

export const CONTEXT_FIXTURES: readonly ContextRecord[] = [
  // ── Maquettes 01/02 ───────────────────────────────────────────────────────────
  build(
    {
      id: NUXT4_CONTEXT_ID,
      slug: 'nuxt/conventions-nuxt-4',
      title: 'Conventions Nuxt 4 — composables & auto-imports',
      description: 'Structure app/, useAsyncData vs useFetch, règles de nommage des composables.',
      collectionId: 'nuxt',
      tags: ['nuxt', 'conventions', 'data-fetching'],
      scope: TEAM,
      status: 'published',
      version: 4,
      tokens: 2140,
      updatedAt: '2026-11-23T09:12:00+01:00',
      createdAt: '2026-09-03T10:21:00+02:00',
      reads: 38,
      content: NUXT4_V4_CONTENT,
      note: 'useAsyncData : clés explicites',
    },
    { draft: NUXT4_DRAFT, history: NUXT4_HISTORY },
  ),
  build({
    id: 'ctx-review-rules',
    slug: 'review/regles-de-revue-de-code',
    title: 'Règles de revue de code (REVIEW.md)',
    description: 'Ce que la revue IA doit signaler, ignorer, et le format attendu des commentaires',
    collectionId: 'review',
    tags: ['review', 'qualité'],
    scope: TEAM,
    status: 'published',
    version: 7,
    tokens: 3400,
    updatedAt: '2026-11-22T15:30:00+01:00',
    reads: 54,
  }),
  build({
    id: 'ctx-vue-migration',
    slug: 'vue/migration-vue-2-7-3-decisions-ouvertes',
    title: 'Migration Vue 2.7 → 3 : décisions ouvertes',
    description: 'Event bus, filtres, $listeners, stratégie de compat build par lot de composants',
    collectionId: 'vue',
    tags: ['vue', 'migration', 'adr'],
    scope: FRONT,
    status: 'draft',
    version: 2,
    tokens: 2900,
    updatedAt: '2026-11-22T10:05:00+01:00',
  }),
  build({
    id: 'ctx-wording',
    slug: 'conventions-allovoisins/wording-tone-of-voice-produit',
    title: 'Wording & tone of voice produit',
    description: 'Tutoiement, longueur des CTA, clés Loco, interdits de vocabulaire',
    collectionId: 'conventions-allovoisins',
    tags: ['wording', 'i18n'],
    scope: TEAM,
    status: 'published',
    version: 3,
    tokens: 1800,
    updatedAt: '2026-11-19T14:00:00+01:00',
    author: 'Camille',
    reads: 21,
  }),
  build({
    id: 'ctx-pinia-stores',
    slug: 'vue/patterns-de-stores-pinia',
    title: 'Patterns de stores Pinia',
    description: 'Setup stores, reset, persistance, tests unitaires des actions',
    collectionId: 'vue',
    tags: ['pinia', 'state'],
    scope: FRONT,
    status: 'published',
    version: 5,
    tokens: 1200,
    updatedAt: '2026-11-17T11:00:00+01:00',
    reads: 12,
  }),
  build({
    id: 'ctx-a11y-checklist',
    slug: 'review/checklist-accessibilite-des-composants',
    title: 'Checklist accessibilité des composants',
    description: 'Focus visible, rôles ARIA, contrastes, navigation clavier : critères bloquants',
    collectionId: 'review',
    tags: ['a11y', 'wcag'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 1500,
    updatedAt: '2026-11-12T16:00:00+01:00',
    reads: 17,
  }),
  build({
    id: 'ctx-nitro-debug',
    slug: 'nuxt/prompts-de-debug-nitro',
    title: 'Prompts de debug Nitro',
    description: 'Mes prompts pour diagnostiquer les routes server/ et le cache Nitro',
    collectionId: 'nuxt',
    tags: ['nitro', 'debug'],
    scope: BRICE,
    status: 'draft',
    version: 1,
    tokens: 600,
    updatedAt: '2026-11-08T18:30:00+01:00',
  }),
  build({
    id: 'ctx-github-actions',
    slug: 'ci-cd/conventions-github-actions',
    title: 'Conventions GitHub Actions',
    description: 'Remplacé par la collection CI/CD v2 — conservé pour les anciennes branches',
    collectionId: 'ci-cd',
    tags: ['ci', 'github-actions'],
    scope: TEAM,
    status: 'archived',
    version: 6,
    tokens: 2200,
    updatedAt: '2026-10-02T17:20:00+02:00',
  }),

  // ── Nuxt (6 publiés + 1 brouillon) ────────────────────────────────────────────
  build({
    id: 'ctx-nuxt-server-routes',
    slug: 'nuxt/routes-server-une-route-par-fichier',
    title: 'Routes server/ : une route par fichier',
    description: 'Arborescence server/api, validation des entrées, codes HTTP et erreurs typées',
    collectionId: 'nuxt',
    tags: ['nuxt', 'conventions', 'data-fetching', 'database'],
    scope: TEAM,
    status: 'published',
    version: 3,
    tokens: 1650,
    updatedAt: '2026-09-30T10:15:00+02:00',
    reads: 9,
  }),
  build({
    id: 'ctx-nuxt-data-fetching',
    slug: 'nuxt/data-fetching-usefetch-useasyncdata',
    title: 'Data fetching : useFetch, useAsyncData, $fetch',
    description: 'Quel outil pour quel appel, clés de cache, déduplication et rafraîchissement',
    collectionId: 'nuxt',
    tags: ['nuxt', 'data-fetching'],
    scope: TEAM,
    status: 'published',
    version: 4,
    tokens: 2050,
    updatedAt: '2026-09-27T09:30:00+02:00',
    reads: 14,
  }),
  build({
    id: 'ctx-nuxt-route-rules',
    slug: 'nuxt/rendu-hybride-et-routerules',
    title: 'Rendu hybride et routeRules',
    description: 'SSR, prerender, ISR et cache par route : les réglages par défaut du front',
    collectionId: 'nuxt',
    tags: ['nuxt', 'ssr', 'performance'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 1320,
    updatedAt: '2026-09-24T10:00:00+02:00',
  }),
  build({
    id: 'ctx-nuxt-plugins',
    slug: 'nuxt/plugins-et-middlewares',
    title: 'Plugins et middlewares Nuxt',
    description: 'Ordre d’exécution, plugins client/serveur, middlewares de route nommés',
    collectionId: 'nuxt',
    tags: ['nuxt', 'conventions'],
    scope: FRONT,
    status: 'published',
    version: 2,
    tokens: 980,
    updatedAt: '2026-09-12T15:45:00+02:00',
  }),
  build({
    id: 'ctx-nuxt-errors',
    slug: 'nuxt/gestion-des-erreurs',
    title: 'Gestion des erreurs : createError et error.vue',
    description: 'Erreurs fatales ou non, page error.vue, remontée Sentry et messages utilisateur',
    collectionId: 'nuxt',
    tags: ['nuxt', 'conventions', 'data-fetching'],
    scope: FRONT,
    status: 'published',
    version: 3,
    tokens: 1440,
    updatedAt: '2026-09-08T11:20:00+02:00',
  }),
  build({
    id: 'ctx-nuxt-seo',
    slug: 'nuxt/seo-useseometa-et-donnees-structurees',
    title: 'SEO : useSeoMeta et données structurées',
    description: 'Balises meta, canonical, JSON-LD des annonces et pages catégories',
    collectionId: 'nuxt',
    tags: ['nuxt', 'seo'],
    scope: TEAM,
    status: 'published',
    version: 1,
    tokens: 1100,
    updatedAt: '2026-09-02T11:00:00+02:00',
  }),
  build({
    id: 'ctx-nuxt-upgrade-notes',
    slug: 'nuxt/notes-de-montee-de-version-nuxt-4-2',
    title: 'Notes de montée de version Nuxt 4.2',
    description: 'Changements cassants repérés et points à vérifier avant la montée de version',
    collectionId: 'nuxt',
    tags: ['nuxt', 'data-fetching'],
    scope: BRICE,
    status: 'draft',
    version: 1,
    tokens: 700,
    updatedAt: '2026-09-21T18:00:00+02:00',
  }),

  // ── Vue (5 publiés + 1 brouillon) ─────────────────────────────────────────────
  build({
    id: 'ctx-vue-components',
    slug: 'vue/conventions-de-composants-vue-3',
    title: 'Conventions de composants Vue 3',
    description: 'script setup, découpage, nommage des fichiers et ordre des blocs',
    collectionId: 'vue',
    tags: ['vue', 'conventions', 'typescript'],
    scope: TEAM,
    status: 'published',
    version: 6,
    tokens: 1900,
    updatedAt: '2026-09-29T10:30:00+02:00',
    reads: 11,
  }),
  build({
    id: 'ctx-vue-composables',
    slug: 'vue/composables-nommage-et-retour-type',
    title: 'Composables : nommage et retour typé',
    description: 'Préfixe use, paramètres réactifs, retour en objet de refs, effets nettoyés',
    collectionId: 'vue',
    tags: ['vue', 'vue3', 'conventions'],
    scope: FRONT,
    status: 'published',
    version: 2,
    tokens: 1250,
    updatedAt: '2026-09-19T14:10:00+02:00',
  }),
  build({
    id: 'ctx-vue-vitest',
    slug: 'vue/tests-de-composants-avec-vitest',
    title: 'Tests de composants avec Vitest',
    description: 'Testing Library, mocks de stores, ce qu’on teste et ce qu’on ne teste pas',
    collectionId: 'vue',
    tags: ['vue3', 'testing', 'vitest', 'pinia'],
    scope: FRONT,
    status: 'published',
    version: 3,
    tokens: 1580,
    updatedAt: '2026-09-25T16:20:00+02:00',
  }),
  build({
    id: 'ctx-vue-store-tests',
    slug: 'vue/stores-pinia-tests-et-mocks',
    title: 'Stores Pinia : tests et mocks',
    description: 'createTestingPinia, actions espionnées, état initial par test',
    collectionId: 'vue',
    tags: ['pinia', 'vue3', 'testing'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 900,
    updatedAt: '2026-08-21T09:50:00+02:00',
  }),
  build({
    id: 'ctx-vue-typed-props',
    slug: 'vue/props-emits-et-v-model-types',
    title: 'Props, emits et v-model typés',
    description: 'defineProps générique, defineModel, émissions typées et valeurs par défaut',
    collectionId: 'vue',
    tags: ['vue', 'vuejs', 'typescript'],
    scope: FRONT,
    status: 'published',
    version: 1,
    tokens: 1050,
    updatedAt: '2026-08-14T11:30:00+02:00',
  }),
  build({
    id: 'ctx-vue-mixins',
    slug: 'vue/suppression-progressive-des-mixins',
    title: 'Suppression progressive des mixins',
    description: 'Inventaire des mixins restants et composable de remplacement pour chacun',
    collectionId: 'vue',
    tags: ['vue3', 'migration'],
    scope: FRONT,
    status: 'draft',
    version: 1,
    tokens: 760,
    updatedAt: '2026-09-16T17:40:00+02:00',
  }),

  // ── Conventions AlloVoisins (5 publiés + 1 brouillon) ─────────────────────────
  build({
    id: 'ctx-loco-keys',
    slug: 'conventions-allovoisins/cles-loco-et-pluriels',
    title: 'Clés Loco et pluriels',
    description: 'Nommage des clés de traduction, pluriels ICU, variables et relecture',
    collectionId: 'conventions-allovoisins',
    tags: ['i18n', 'conventions'],
    scope: TEAM,
    status: 'published',
    version: 4,
    tokens: 1150,
    updatedAt: '2026-09-18T09:00:00+02:00',
    author: 'Camille',
  }),
  build({
    id: 'ctx-commit-messages',
    slug: 'conventions-allovoisins/messages-de-commit-et-changelog',
    title: 'Messages de commit et changelog',
    description: 'Format des messages, référence du ticket, rédaction des notes de version',
    collectionId: 'conventions-allovoisins',
    tags: ['wording'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 640,
    updatedAt: '2026-07-30T10:00:00+02:00',
  }),
  build({
    id: 'ctx-design-system',
    slug: 'conventions-allovoisins/design-system-tokens-et-composants',
    title: 'Design system : tokens et composants',
    description: 'Tokens de couleur et d’espacement, composants de base et règles d’accessibilité',
    collectionId: 'conventions-allovoisins',
    tags: ['design-system', 'scss', 'a11y', 'vue', 'conventions'],
    scope: TEAM,
    status: 'published',
    version: 5,
    tokens: 2600,
    updatedAt: '2026-09-15T14:00:00+02:00',
    reads: 8,
  }),
  build({
    id: 'ctx-product-rules',
    slug: 'conventions-allovoisins/regles-produit-transverses',
    title: 'Règles produit transverses',
    description: 'Montants, dates, distances et statuts : comment les afficher partout pareil',
    collectionId: 'conventions-allovoisins',
    tags: ['wording', 'conventions'],
    scope: TEAM,
    status: 'published',
    version: 3,
    tokens: 1350,
    updatedAt: '2026-09-05T15:30:00+02:00',
    author: 'Camille',
  }),
  build({
    id: 'ctx-front-security',
    slug: 'conventions-allovoisins/securite-front-secrets-et-dependances',
    title: 'Sécurité front : secrets et dépendances',
    description: 'Variables publiques ou privées, audit des dépendances, en-têtes de sécurité',
    collectionId: 'conventions-allovoisins',
    tags: ['security'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 1000,
    updatedAt: '2026-08-27T10:00:00+02:00',
  }),
  build({
    id: 'ctx-glossary',
    slug: 'conventions-allovoisins/glossaire-metier-allovoisins',
    title: 'Glossaire métier AlloVoisins',
    description: 'Demandeur, prestataire, mission, devis : les termes à employer et à éviter',
    collectionId: 'conventions-allovoisins',
    tags: ['wording', 'conventions'],
    scope: TEAM,
    status: 'draft',
    version: 1,
    tokens: 820,
    updatedAt: '2026-09-09T12:00:00+02:00',
    author: 'Camille',
  }),

  // ── Review (4 publiés) ────────────────────────────────────────────────────────
  build({
    id: 'ctx-review-pr-checklist',
    slug: 'review/revue-des-pr-front-checklist',
    title: 'Revue des PR front : checklist',
    description: 'Lisibilité, tests, accessibilité, performance : la grille de relecture',
    collectionId: 'review',
    tags: ['review', 'qualité', 'vue'],
    scope: TEAM,
    status: 'published',
    version: 4,
    tokens: 1700,
    updatedAt: '2026-09-23T09:10:00+02:00',
    reads: 6,
  }),
  build({
    id: 'ctx-review-performance',
    slug: 'review/revue-de-performance-web',
    title: 'Revue de performance web',
    description: 'Core Web Vitals, poids des bundles, images et polices : seuils et outils',
    collectionId: 'review',
    tags: ['review', 'performance', 'vue', 'data-viz'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 1400,
    updatedAt: '2026-09-28T15:00:00+02:00',
  }),
  build({
    id: 'ctx-review-a11y-method',
    slug: 'review/audit-accessibilite-methode',
    title: 'Audit accessibilité : méthode',
    description: 'Parcours clavier, lecteur d’écran, contrastes : déroulé d’un audit rapide',
    collectionId: 'review',
    tags: ['review', 'a11y', 'wcag'],
    scope: TEAM,
    status: 'published',
    version: 1,
    tokens: 1250,
    updatedAt: '2026-08-19T10:40:00+02:00',
  }),
  build({
    id: 'ctx-review-security',
    slug: 'review/revue-de-securite-applicative',
    title: 'Revue de sécurité applicative',
    description: 'Injections, XSS, contrôle d’accès : points de contrôle à chaque PR',
    collectionId: 'review',
    tags: ['review', 'security'],
    scope: TEAM,
    status: 'published',
    version: 3,
    tokens: 1600,
    updatedAt: '2026-08-11T14:25:00+02:00',
  }),

  // ── CI/CD (3 publiés) ─────────────────────────────────────────────────────────
  build({
    id: 'ctx-gha-v2',
    slug: 'ci-cd/workflows-github-actions-v2',
    title: 'Workflows GitHub Actions v2',
    description: 'Jobs réutilisables, cache npm, matrices et déploiement des previews',
    collectionId: 'ci-cd',
    tags: ['ci', 'github-actions'],
    scope: TEAM,
    status: 'published',
    version: 3,
    tokens: 1850,
    updatedAt: '2026-09-26T13:00:00+02:00',
    reads: 7,
  }),
  build({
    id: 'ctx-gitlab-ci',
    slug: 'ci-cd/pipeline-gitlab-ci-des-services',
    title: 'Pipeline GitLab CI des services',
    description: 'Étapes du pipeline, images Docker de build et règles de déclenchement',
    collectionId: 'ci-cd',
    tags: ['ci', 'docker'],
    scope: TEAM,
    status: 'published',
    version: 2,
    tokens: 1300,
    updatedAt: '2026-07-08T11:00:00+02:00',
  }),
  build({
    id: 'ctx-e2e-playwright',
    slug: 'ci-cd/tests-e2e-playwright-en-ci',
    title: 'Tests E2E Playwright en CI',
    description: 'Sharding, retries, traces et rapport publié sur chaque PR',
    collectionId: 'ci-cd',
    tags: ['ci', 'playwright', 'testing', 'vuejs'],
    scope: FRONT,
    status: 'published',
    version: 2,
    tokens: 1150,
    updatedAt: '2026-09-10T17:00:00+02:00',
  }),

  // ── Sans collection (3 publiés, 3 brouillons, 2 archivés) ─────────────────────
  build({
    id: 'ctx-review-shortcuts',
    slug: 'mes-raccourcis-de-revue',
    title: 'Mes raccourcis de revue',
    description: 'Commentaires types et prompts de relecture que je réutilise',
    collectionId: null,
    tags: ['review', 'vue', 'pinia'],
    scope: BRICE,
    status: 'published',
    version: 2,
    tokens: 520,
    updatedAt: '2026-09-17T19:10:00+02:00',
  }),
  build({
    id: 'ctx-mobile-api',
    slug: 'contrat-d-api-mobile',
    title: 'Contrat d’API mobile',
    description:
      'Pagination, format des erreurs et versionnement des endpoints consommés par les apps',
    collectionId: null,
    tags: ['data-fetching', 'typescript', 'database'],
    scope: API,
    status: 'published',
    version: 3,
    tokens: 1750,
    updatedAt: '2026-09-22T16:00:00+02:00',
  }),
  build({
    id: 'ctx-release-checklist',
    slug: 'checklist-de-mise-en-production',
    title: 'Checklist de mise en production',
    description: 'Vérifications avant et après déploiement, rollback et communication',
    collectionId: null,
    tags: ['nuxt', 'performance'],
    scope: TEAM,
    status: 'published',
    version: 5,
    tokens: 1200,
    updatedAt: '2026-09-14T08:45:00+02:00',
  }),
  build({
    id: 'ctx-refactoring-prompts',
    slug: 'brouillon-prompts-de-refactoring',
    title: 'Brouillon : prompts de refactoring',
    description: 'Prompts pour migrer un composant Options API vers script setup',
    collectionId: null,
    tags: ['vue3', 'typescript'],
    scope: BRICE,
    status: 'draft',
    version: 1,
    tokens: 450,
    updatedAt: '2026-09-29T21:00:00+02:00',
  }),
  build({
    id: 'ctx-front-split',
    slug: 'idees-de-decoupage-du-front',
    title: 'Idées de découpage du front',
    description: 'Pistes pour isoler les domaines métier dans des layers Nuxt',
    collectionId: null,
    tags: ['conventions'],
    scope: FRONT,
    status: 'draft',
    version: 2,
    tokens: 980,
    updatedAt: '2026-09-11T10:20:00+02:00',
  }),
  build({
    id: 'ctx-vite-notes',
    slug: 'notes-vite-8',
    title: 'Notes Vite 8',
    description: 'Ce qui change avec Rolldown et les options à revoir',
    collectionId: null,
    tags: ['performance'],
    scope: BRICE,
    status: 'draft',
    version: 1,
    tokens: 380,
    updatedAt: '2026-08-30T22:15:00+02:00',
  }),
  build({
    id: 'ctx-webpack-config',
    slug: 'ancienne-configuration-de-build',
    title: 'Ancienne configuration de build',
    description: 'Configuration historique du build front, conservée pour référence',
    collectionId: null,
    tags: ['docker'],
    scope: TEAM,
    status: 'archived',
    version: 4,
    tokens: 2100,
    updatedAt: '2026-05-12T10:00:00+02:00',
  }),
  build({
    id: 'ctx-vue2-conventions',
    slug: 'conventions-vue-2-obsolete',
    title: 'Conventions Vue 2 (obsolète)',
    description: 'Ancien guide de style Vue 2, remplacé par les conventions Vue 3',
    collectionId: null,
    tags: ['migration'],
    scope: FRONT,
    status: 'archived',
    version: 7,
    tokens: 2400,
    updatedAt: '2026-04-03T09:00:00+02:00',
  }),
]
