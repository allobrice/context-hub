/**
 * Missions de démo (maquettes 31 à 39) : un lot « Audit perf · page d'accueil Nuxt » créé par la
 * session perf-1 de Brice, avec une mission par statut affiché dans la file. Dates relatives à
 * `DEMO_NOW` (« expire dans 13 j », « réservée depuis 18 min »). Partagées par le seed du serveur et
 * l'adapter in-memory du front.
 */
import type { SessionRef } from '../sessions/session.ts'
import {
  MISSION_EXPIRY_MS,
  type Mission,
  type MissionCore,
  type MissionEvent,
  type MissionEventActor,
  type MissionEventType,
} from '../missions/types.ts'
import { NUXT4_CONTEXT_ID } from './contexts.ts'
import { DEMO_NOW } from './now.ts'
import { DEMO_USERS } from './workspaces.ts'

export interface MissionFixture {
  readonly mission: Mission
  /** Journal du cycle de vie, du plus ancien au plus récent. */
  readonly events: readonly MissionEvent[]
}

const NOW_MS = Date.parse(DEMO_NOW)
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/** Date ISO UTC, `ms` millisecondes avant `DEMO_NOW` (négatif : après). */
function ago(ms: number): string {
  return new Date(NOW_MS - ms).toISOString()
}

const FRONT = 'allovoisins/front'
export const AUDIT_BATCH_ID = 'audit-perf-home-2026-11'
export const AUDIT_COMMIT = 'a41c9e2'
const AUDIT_LABEL = 'Audit perf · page d’accueil Nuxt'
/** Création du lot : la veille (« expire dans 13 j »). */
const AUDIT_AT = 21 * HOUR

function session(user: keyof typeof DEMO_USERS, sessionLabel: string): SessionRef {
  return { userId: DEMO_USERS[user].id, userName: DEMO_USERS[user].name, sessionLabel, repo: FRONT }
}

const PERF_1 = session('brice', 'perf-1')
const WEB_2 = session('camille', 'web-2')
const BRICE = { userId: DEMO_USERS.brice.id }

/** Prompt de la maquette 35 (« Lazy-load du carrousel de la home »). */
export const LCP_PROMPT = [
  '## Objectif',
  '',
  'Faire passer le LCP mobile de la page d’accueil sous 2,5 s en retardant le chargement du carrousel des catégories.',
  '',
  '## Constat',
  '',
  `Audit du 25 nov., commit \`${AUDIT_COMMIT}\`. LCP mobile (Lighthouse, Moto G Power, 4G lente) : **3,8 s**. L’élément LCP est la première image du carrousel. \`HomeCarousel.vue\` est importé de façon synchrone et charge 8 images en eager.`,
  '',
  '## Fichiers',
  '',
  '- `app/pages/index.vue`',
  '- `app/components/home/HomeCarousel.vue`',
  '- `nuxt.config.ts` (config `@nuxt/image`)',
  '',
  '## À faire',
  '',
  '1. Première image : `fetchpriority="high"`, préchargée ; les suivantes en `loading="lazy"`.',
  '2. Rendre le reste du carrousel en `LazyHomeCarousel` hors du viewport initial.',
  '',
  '## Critères d’acceptation',
  '',
  '- LCP mobile ≤ 2,5 s sur 3 mesures. Pas de CLS ajouté (≤ 0,05).',
  '- Tests du composant verts. Aucun changement visuel au-dessus de la ligne de flottaison.',
  '',
  '## Contextes liés',
  '',
  '- Conventions Nuxt 4 — composables & auto-imports (v4)',
].join('\n')

/** Prompt court mais complet (gabarit §8.3) pour les autres axes de l'audit. */
function auditPrompt(
  goal: string,
  finding: string,
  files: readonly string[],
  todo: string,
): string {
  return [
    '## Objectif',
    '',
    goal,
    '',
    '## Constat',
    '',
    `Audit du 25 nov., commit \`${AUDIT_COMMIT}\`. ${finding}`,
    '',
    '## Fichiers',
    '',
    ...files.map((file) => `- \`${file}\``),
    '',
    '## À faire',
    '',
    todo,
    '',
    '## Critères d’acceptation',
    '',
    '- Gain mesuré sur 3 passages Lighthouse mobile, sans régression visuelle.',
  ].join('\n')
}

interface Spec {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly priority: MissionCore['priority']
  readonly tags: readonly string[]
  readonly files: readonly string[]
  /** Création, en ms avant `DEMO_NOW`. */
  readonly createdAgo: number
  readonly linkedContextIds?: MissionCore['linkedContextIds']
  readonly freshness?: MissionCore['freshness']
}

function core(spec: Spec, updatedAgo: number): MissionCore {
  return {
    id: spec.id,
    slug: spec.slug,
    title: spec.title,
    summary: spec.summary,
    prompt: spec.prompt,
    priority: spec.priority,
    tags: spec.tags,
    scope: { kind: 'team', team: 'allovoisins' },
    origin: { label: AUDIT_LABEL, batchId: AUDIT_BATCH_ID, session: PERF_1, createdBy: 'brice' },
    codeRef: { repo: FRONT, commit: AUDIT_COMMIT, files: spec.files },
    freshness: spec.freshness ?? null,
    linkedContextIds: spec.linkedContextIds ?? [],
    workspaceId: null,
    suspicious: false,
    createdAt: ago(spec.createdAgo),
    expiresAt: ago(spec.createdAgo - MISSION_EXPIRY_MS),
    updatedAt: ago(updatedAgo),
  }
}

function event(
  mission: Pick<Mission, 'id' | 'slug' | 'title'>,
  type: MissionEventType,
  actor: MissionEventActor,
  atAgo: number,
  detail: string | null = null,
): MissionEvent {
  return {
    missionId: mission.id,
    missionSlug: mission.slug,
    missionTitle: mission.title,
    at: ago(atAgo),
    actor,
    type,
    detail,
  }
}

const OPEN = { claim: null, result: null, dropReason: null, closedAt: null } as const
const VALIDATED_AGO = AUDIT_AT - 14 * MINUTE
const VALIDATION = { by: 'brice', at: ago(VALIDATED_AGO) }

const LCP: Spec = {
  id: 'mission-perf-lcp-carrousel',
  slug: 'perf-lcp-carrousel',
  title: 'Lazy-load du carrousel de la home',
  summary: 'LCP mobile 3,8 s : l’image du carrousel est l’élément LCP et bloque le rendu',
  prompt: LCP_PROMPT,
  priority: 'P1',
  tags: ['perf', 'lcp', 'nuxt'],
  files: ['app/pages/index.vue', 'app/components/home/HomeCarousel.vue', 'nuxt.config.ts'],
  createdAgo: AUDIT_AT - 4 * MINUTE,
  linkedContextIds: [NUXT4_CONTEXT_ID],
}

const FONTS: Spec = {
  id: 'mission-perf-fonts',
  slug: 'perf-precharger-polices',
  title: 'Précharger TT Chocolates et passer en font-display: swap',
  summary: 'FOIT de 600 ms sur la home, police chargée tardivement par le CSS',
  prompt: auditPrompt(
    'Supprimer le FOIT de la page d’accueil.',
    'FOIT de 600 ms : la police TT Chocolates est découverte tardivement par le CSS.',
    ['app/assets/styles/fonts.scss', 'nuxt.config.ts'],
    'Précharger la police (`<link rel="preload">`) et passer en `font-display: swap`.',
  ),
  priority: 'P1',
  tags: ['perf', 'fonts'],
  files: ['app/assets/styles/fonts.scss', 'nuxt.config.ts'],
  createdAgo: AUDIT_AT - 5 * MINUTE,
}

const VENDOR: Spec = {
  id: 'mission-perf-vendor',
  slug: 'perf-decouper-chunk-vendor',
  title: 'Découper le chunk vendor (lodash, dayjs)',
  summary: 'Chunk vendor de 412 ko gzip chargé sur toutes les pages',
  prompt: auditPrompt(
    'Réduire le JavaScript chargé sur toutes les pages.',
    'Le chunk vendor pèse 412 ko gzip (lodash complet, dayjs et ses locales).',
    ['nuxt.config.ts', 'app/utils/dates.ts', 'app/utils/collections.ts'],
    'Importer lodash par fonction, ne charger que la locale `fr` de dayjs, découper le chunk.',
  ),
  priority: 'P2',
  tags: ['perf', 'bundle'],
  files: ['nuxt.config.ts', 'app/utils/dates.ts', 'app/utils/collections.ts'],
  createdAgo: AUDIT_AT - 6 * MINUTE,
  freshness: {
    checkedAt: ago(2 * HOUR),
    changedFiles: ['app/utils/dates.ts', 'app/utils/collections.ts'],
    checkedBy: WEB_2,
  },
}

const FOOTER: Spec = {
  id: 'mission-perf-footer',
  slug: 'perf-hydratation-footer',
  title: 'Hydratation différée du footer',
  summary: 'Le footer hydrate 38 composants inutiles au premier rendu',
  prompt: auditPrompt(
    'Ne plus hydrater le footer au premier rendu.',
    'Le footer hydrate 38 composants inutiles au premier rendu (TBT + 120 ms).',
    ['app/components/layout/AppFooter.vue'],
    'Passer le footer en composant lazy, hydraté à la visibilité.',
  ),
  priority: 'P2',
  tags: ['perf', 'hydration'],
  files: ['app/components/layout/AppFooter.vue'],
  createdAgo: AUDIT_AT - 7 * MINUTE,
}

const IMAGES: Spec = {
  id: 'mission-perf-images',
  slug: 'perf-images-avif',
  title: 'Servir les visuels de la home en AVIF',
  summary: 'Les visuels de la home pèsent 1,9 Mo en JPEG',
  prompt: auditPrompt(
    'Alléger les visuels de la page d’accueil.',
    'Les visuels de la home pèsent 1,9 Mo en JPEG, sans `srcset`.',
    ['app/components/home/HomeHero.vue'],
    'Servir les visuels en AVIF avec `@nuxt/image` et des `srcset` adaptés.',
  ),
  priority: 'P2',
  tags: ['perf', 'images'],
  files: ['app/components/home/HomeHero.vue'],
  createdAgo: AUDIT_AT - 8 * MINUTE,
}

const PREFETCH: Spec = {
  id: 'mission-perf-prefetch',
  slug: 'perf-prefetch-liens',
  title: 'Désactiver le prefetch des liens du menu',
  summary: 'Le menu précharge 14 pages au survol, sur mobile',
  prompt: auditPrompt(
    'Ne plus précharger les pages du menu sur mobile.',
    'Le menu précharge 14 pages au survol, ce qui consomme la bande passante mobile.',
    ['app/components/layout/AppMenu.vue'],
    'Désactiver `prefetch` sur les liens du menu en mobile.',
  ),
  priority: 'P3',
  tags: ['perf'],
  files: ['app/components/layout/AppMenu.vue'],
  createdAgo: AUDIT_AT - 9 * MINUTE,
}

function created(spec: Spec): MissionEvent {
  return event(spec, 'created', PERF_1, spec.createdAgo, 'draft')
}

/** Une mission par statut de la file (maquette 31), et la mission terminée de la maquette 38. */
export const MISSION_FIXTURES: readonly MissionFixture[] = [
  {
    mission: { ...core(LCP, VALIDATED_AGO), ...OPEN, status: 'ready', validation: VALIDATION },
    events: [created(LCP), event(LCP, 'validated', BRICE, VALIDATED_AGO)],
  },
  {
    mission: {
      ...core(FONTS, MINUTE),
      ...OPEN,
      status: 'in_progress',
      validation: VALIDATION,
      claim: { session: WEB_2, acquiredAt: ago(18 * MINUTE), expiresAt: ago(MINUTE - 30 * MINUTE) },
    },
    events: [
      created(FONTS),
      event(FONTS, 'validated', BRICE, VALIDATED_AGO),
      event(FONTS, 'taken', WEB_2, 18 * MINUTE),
      event(FONTS, 'freshness', WEB_2, 17 * MINUTE, '0 fichier(s) modifié(s)'),
    ],
  },
  {
    mission: { ...core(VENDOR, 2 * HOUR), ...OPEN, status: 'ready', validation: VALIDATION },
    events: [
      created(VENDOR),
      event(VENDOR, 'validated', BRICE, VALIDATED_AGO),
      event(VENDOR, 'taken', WEB_2, 2 * HOUR + 5 * MINUTE),
      event(VENDOR, 'freshness', WEB_2, 2 * HOUR, '2 fichier(s) modifié(s)'),
      event(VENDOR, 'released', WEB_2, 2 * HOUR - MINUTE),
    ],
  },
  {
    mission: { ...core(FOOTER, FOOTER.createdAgo), ...OPEN, status: 'draft', validation: null },
    events: [created(FOOTER)],
  },
  {
    mission: {
      ...core(IMAGES, 3 * HOUR),
      status: 'done',
      validation: VALIDATION,
      claim: null,
      result: {
        summary:
          'Visuels servis en AVIF par @nuxt/image, avec des srcset adaptés au viewport. Poids des images de la home divisé par 4.',
        deliverables: [{ kind: 'pr', ref: '!4812' }],
        metrics: [
          { name: 'Poids des images', before: '1,9 Mo', after: '0,46 Mo' },
          { name: 'LCP mobile', before: '3,8 s', after: '3,4 s' },
        ],
        acceptanceMet: true,
      },
      dropReason: null,
      closedAt: ago(3 * HOUR),
    },
    events: [
      created(IMAGES),
      event(IMAGES, 'validated', BRICE, VALIDATED_AGO),
      event(IMAGES, 'taken', WEB_2, 5 * HOUR),
      event(IMAGES, 'freshness', WEB_2, 5 * HOUR - MINUTE, '0 fichier(s) modifié(s)'),
      event(IMAGES, 'completed', WEB_2, 3 * HOUR),
    ],
  },
  {
    mission: {
      ...core(PREFETCH, 4 * HOUR),
      status: 'dropped',
      validation: VALIDATION,
      claim: null,
      result: null,
      dropReason: 'Doublon : le prefetch du menu est déjà désactivé par la PR !4790.',
      closedAt: ago(4 * HOUR),
    },
    events: [
      created(PREFETCH),
      event(PREFETCH, 'validated', BRICE, VALIDATED_AGO),
      event(
        PREFETCH,
        'dropped',
        BRICE,
        4 * HOUR,
        'Doublon : le prefetch du menu est déjà désactivé par la PR !4790.',
      ),
    ],
  },
]
