/**
 * Workspaces de démo (maquettes 23 à 30) : textes, compteurs et dates relatives aux maquettes, par
 * rapport à `DEMO_NOW`. Partagés par le seed du serveur et l'adapter in-memory du front.
 *
 * Les entrées #1 à #41 de « migration-auth » ne sont pas visibles dans les maquettes (« Charger les
 * entrées précédentes (#1–#41) ») : elles sont plausibles, sans valeur de référence.
 */
import { toContextId } from '../context/types.ts'
import type {
  AuthoredEntryKind,
  Claim,
  EntryAuthor,
  EntryKind,
  Participant,
  SessionRef,
  Workspace,
  WorkspaceEntry,
} from '../workspaces/types.ts'
import { NUXT4_CONTEXT_ID } from './contexts.ts'
import { DEMO_NOW } from './now.ts'

export interface WorkspaceMemberFixture {
  readonly userId: string
  readonly role: 'creator' | 'member'
  readonly addedAt: string
}

export interface WorkspaceFixture {
  readonly workspace: Workspace
  readonly members: readonly WorkspaceMemberFixture[]
  readonly participants: readonly Participant[]
  readonly claims: readonly Claim[]
  readonly entries: readonly WorkspaceEntry[]
}

const NOW_MS = Date.parse(DEMO_NOW)
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Date ISO UTC, `ms` millisecondes avant `DEMO_NOW`. */
function ago(ms: number): string {
  return new Date(NOW_MS - ms).toISOString()
}

/** Date ISO UTC, `ms` millisecondes après `DEMO_NOW`. */
function inFuture(ms: number): string {
  return new Date(NOW_MS + ms).toISOString()
}

export const DEMO_USERS = {
  brice: { id: 'brice', name: 'Brice' },
  camille: { id: 'camille', name: 'Camille' },
} as const

const FRONT = 'allovoisins/front'
const API = 'allovoisins/api'

function session(
  user: keyof typeof DEMO_USERS,
  sessionLabel: string,
  repo: string | null,
): SessionRef {
  return { userId: DEMO_USERS[user].id, userName: DEMO_USERS[user].name, sessionLabel, repo }
}

const WEB_1 = session('brice', 'web-1', FRONT)
const WEB_2 = session('camille', 'web-2', FRONT)
const API_1 = session('brice', 'api-1', API)
const TESTS_1 = session('brice', 'tests-1', FRONT)

interface EntrySpec {
  readonly kind: EntryKind
  readonly author: EntryAuthor
  readonly body: string
  readonly files?: readonly string[]
  readonly redactions?: number
  readonly at: string
}

function entries(workspaceId: string, specs: readonly EntrySpec[]): WorkspaceEntry[] {
  return specs.map((spec, index) => ({
    workspaceId,
    seq: index + 1,
    kind: spec.kind,
    body: spec.body,
    files: spec.files ?? [],
    author: spec.author,
    redactions: spec.redactions ?? 0,
    suspicious: false,
    createdAt: spec.at,
  }))
}

// ── migration-auth (maquettes 26 à 30) ────────────────────────────────────────

export const MIGRATION_AUTH_ID = 'ws-migration-auth'

const EARLIER_TOPICS: readonly (readonly [AuthoredEntryKind, SessionRef, string])[] = [
  ['status', WEB_1, 'Inventaire des appels qui lisent le JWT dans localStorage : 14 occurrences.'],
  ['note', API_1, 'Le middleware d’auth Nitro lit déjà un cookie pour l’admin : réutilisable.'],
  ['question', WEB_2, 'Les appels SSR passent-ils le cookie au backend, ou faut-il un proxy ?'],
  ['note', API_1, 'Les appels SSR passent par useRequestFetch : le cookie suit.'],
  ['status', TESTS_1, 'Suite e2e de connexion lancée sur la branche : 12 / 12 vertes.'],
  ['handoff', WEB_1, 'Plan de migration rédigé dans le ticket ; découpage en 4 étapes.'],
  ['status', API_1, 'Endpoint POST /auth/session esquissé, sans persistance.'],
  ['note', WEB_2, 'Le refresh actuel repose sur un setInterval de 10 min, à supprimer.'],
]

function earlierEntries(): EntrySpec[] {
  // #1 à #41, de 2 h à 20 min avant « maintenant », réparties régulièrement.
  return Array.from({ length: 41 }, (_, index) => {
    const at = ago(2 * HOUR - Math.round((index * (100 * MINUTE)) / 41))
    if (index === 0) {
      return {
        kind: 'system',
        author: { system: 'lifecycle' },
        body: 'Workspace créé par Brice.',
        at,
      } satisfies EntrySpec
    }
    const topic = EARLIER_TOPICS[(index - 1) % EARLIER_TOPICS.length]
    if (topic === undefined) throw new Error('EARLIER_TOPICS vide')
    const [kind, author, body] = topic
    const round = Math.floor((index - 1) / EARLIER_TOPICS.length) + 1
    return { kind, author, body: round === 1 ? body : `${body} (point ${round})`, at }
  })
}

const MIGRATION_AUTH_ENTRIES = entries(MIGRATION_AUTH_ID, [
  ...earlierEntries(),
  {
    kind: 'note',
    author: WEB_2,
    body: 'Variables d’environnement du staging vérifiées.',
    files: ['.env.staging'],
    redactions: 1,
    at: ago(18 * MINUTE),
  },
  {
    kind: 'system',
    author: { system: 'claim' },
    body: 'web-1 a réservé apps/web/src/auth/** pour 30 min.',
    at: ago(14 * MINUTE),
  },
  {
    kind: 'handoff',
    author: API_1,
    body: 'Contrat de POST /auth/session prêt et testé. À intégrer côté web : réponse 204, cookie posé par le serveur, aucun token dans le corps.',
    files: ['openapi/auth.yaml'],
    at: ago(11 * MINUTE),
  },
  {
    kind: 'status',
    author: WEB_1,
    body: 'useSession() migré vers le cookie, 4 tests verts. Reste : le middleware de route et la suppression du stockage du token.',
    files: ['apps/web/src/auth/useSession.ts', 'apps/web/src/auth/useSession.test.ts'],
    at: ago(6 * MINUTE),
  },
  {
    kind: 'question',
    author: WEB_1,
    body: 'À l’expiration de la session : refresh silencieux côté client, ou redirection vers /login avec retour à la page courante ?',
    at: ago(4 * MINUTE),
  },
  {
    kind: 'decision',
    author: API_1,
    body: 'Le cookie de session s’appelle av_session (httpOnly, SameSite=Lax, 30 jours glissants). POST /auth/session remplace POST /auth/token, qui reste disponible jusqu’à la fin de la migration.',
    files: ['server/api/auth/session.post.ts'],
    at: ago(2 * MINUTE),
  },
  {
    kind: 'system',
    author: { system: 'hook' },
    body: 'Écriture bloquée : la session web-2 a tenté de modifier apps/web/src/auth/useSession.ts, dans une zone réservée par web-1.',
    files: ['apps/web/src/auth/useSession.ts'],
    at: ago(40 * SECOND),
  },
])

const MIGRATION_AUTH: WorkspaceFixture = {
  workspace: {
    id: MIGRATION_AUTH_ID,
    slug: 'migration-auth',
    title: 'Migration de l’auth vers les sessions Nitro',
    goal: 'Remplacer le JWT stocké en localStorage par une session httpOnly gérée par Nitro, avec le front et l’API alignés sur le même contrat.',
    status: 'open',
    repos: [FRONT, API],
    linkedContextIds: [NUXT4_CONTEXT_ID, toContextId('ctx-a11y-checklist')],
    createdBy: 'brice',
    createdAt: ago(2 * HOUR),
    lastActivityAt: ago(40 * SECOND),
    closedAt: null,
  },
  members: [
    { userId: 'brice', role: 'creator', addedAt: ago(2 * HOUR) },
    { userId: 'camille', role: 'member', addedAt: ago(2 * HOUR - 5 * MINUTE) },
  ],
  participants: [
    { session: WEB_1, joinedAt: ago(2 * HOUR), lastSeenAt: ago(0), cursor: 49 },
    { session: WEB_2, joinedAt: ago(110 * MINUTE), lastSeenAt: ago(40 * SECOND), cursor: 49 },
    { session: API_1, joinedAt: ago(115 * MINUTE), lastSeenAt: ago(2 * MINUTE), cursor: 48 },
    { session: TESTS_1, joinedAt: ago(90 * MINUTE), lastSeenAt: ago(25 * MINUTE), cursor: 30 },
  ].map((participant) => ({ workspaceId: MIGRATION_AUTH_ID, ...participant })),
  claims: [
    {
      id: 'claim-web-auth',
      workspaceId: MIGRATION_AUTH_ID,
      repo: FRONT,
      area: 'apps/web/src/auth/**',
      holder: WEB_1,
      acquiredAt: ago(14 * MINUTE),
      expiresAt: inFuture(22 * MINUTE),
    },
    {
      id: 'claim-api-auth',
      workspaceId: MIGRATION_AUTH_ID,
      repo: API,
      area: 'server/api/auth/**',
      holder: API_1,
      acquiredAt: ago(26 * MINUTE),
      expiresAt: inFuture(4 * MINUTE),
    },
  ],
  entries: MIGRATION_AUTH_ENTRIES,
}

// ── Autres workspaces de la liste (maquette 23) ───────────────────────────────

const SEARCH_1 = session('camille', 'search-1', FRONT)
const SEARCH_2 = session('brice', 'search-2', FRONT)
const REFONTE_ID = 'ws-refonte-recherche'

const REFONTE_RECHERCHE: WorkspaceFixture = {
  workspace: {
    id: REFONTE_ID,
    slug: 'refonte-recherche',
    title: 'Refonte de la recherche d’offres',
    goal: 'Nouvelle page de résultats et facettes, sans régression SEO',
    status: 'open',
    repos: [FRONT],
    linkedContextIds: [],
    createdBy: 'camille',
    createdAt: ago(3 * DAY),
    lastActivityAt: ago(HOUR),
    closedAt: null,
  },
  members: [
    { userId: 'camille', role: 'creator', addedAt: ago(3 * DAY) },
    { userId: 'brice', role: 'member', addedAt: ago(3 * DAY) },
  ],
  participants: [
    { session: SEARCH_1, joinedAt: ago(3 * DAY), lastSeenAt: ago(MINUTE), cursor: 4 },
    { session: SEARCH_2, joinedAt: ago(2 * DAY), lastSeenAt: ago(5 * HOUR), cursor: 3 },
  ].map((participant) => ({ workspaceId: REFONTE_ID, ...participant })),
  claims: [
    {
      id: 'claim-search-facets',
      workspaceId: REFONTE_ID,
      repo: FRONT,
      area: 'apps/web/src/search/facets/**',
      holder: SEARCH_1,
      acquiredAt: ago(HOUR),
      expiresAt: inFuture(29 * MINUTE),
    },
  ],
  entries: entries(REFONTE_ID, [
    {
      kind: 'system',
      author: { system: 'lifecycle' },
      body: 'Workspace créé par Camille.',
      at: ago(3 * DAY),
    },
    {
      kind: 'decision',
      author: SEARCH_1,
      body: 'Les facettes restent dans l’URL (query string) pour conserver les pages indexées.',
      at: ago(2 * DAY),
    },
    {
      kind: 'status',
      author: SEARCH_2,
      body: 'Nouvelle grille de résultats branchée derrière un feature flag.',
      at: ago(5 * HOUR),
    },
    {
      kind: 'system',
      author: { system: 'claim' },
      body: 'search-1 a réservé apps/web/src/search/facets/** pour 30 min.',
      at: ago(HOUR),
    },
  ]),
}

const PERF_ID = 'ws-perf-lcp-home'
const PERF_1 = session('brice', 'perf-1', FRONT)

const PERF_LCP_HOME: WorkspaceFixture = {
  workspace: {
    id: PERF_ID,
    slug: 'perf-lcp-home',
    title: 'LCP de la page d’accueil',
    goal: 'Passer le LCP mobile sous 2,5 s',
    status: 'open',
    repos: [FRONT],
    linkedContextIds: [],
    createdBy: 'brice',
    createdAt: ago(12 * DAY),
    lastActivityAt: ago(8 * DAY),
    closedAt: null,
  },
  members: [{ userId: 'brice', role: 'creator', addedAt: ago(12 * DAY) }],
  participants: [
    {
      workspaceId: PERF_ID,
      session: PERF_1,
      joinedAt: ago(12 * DAY),
      lastSeenAt: ago(8 * DAY),
      cursor: 3,
    },
  ],
  claims: [],
  entries: entries(PERF_ID, [
    {
      kind: 'system',
      author: { system: 'lifecycle' },
      body: 'Workspace créé par Brice.',
      at: ago(12 * DAY),
    },
    {
      kind: 'status',
      author: PERF_1,
      body: 'LCP mobile mesuré à 3,4 s : l’image du hero n’est pas préchargée.',
      at: ago(8 * DAY),
    },
  ]),
}

const NODE_ID = 'ws-upgrade-node-24'
const NODE_1 = session('brice', 'node-1', API)

/** Fermé : visible avec le filtre « Fermés » ou « Tous ». */
const UPGRADE_NODE: WorkspaceFixture = {
  workspace: {
    id: NODE_ID,
    slug: 'upgrade-node-24',
    title: 'Montée de version vers Node 24',
    goal: 'Passer l’API et le front sur Node 24 LTS.',
    status: 'closed',
    repos: [API, FRONT],
    linkedContextIds: [],
    createdBy: 'brice',
    createdAt: ago(40 * DAY),
    lastActivityAt: ago(35 * DAY),
    closedAt: ago(35 * DAY),
  },
  members: [{ userId: 'brice', role: 'creator', addedAt: ago(40 * DAY) }],
  participants: [
    {
      workspaceId: NODE_ID,
      session: NODE_1,
      joinedAt: ago(40 * DAY),
      lastSeenAt: ago(35 * DAY),
      cursor: 3,
    },
  ],
  claims: [],
  entries: entries(NODE_ID, [
    {
      kind: 'system',
      author: { system: 'lifecycle' },
      body: 'Workspace créé par Brice.',
      at: ago(40 * DAY),
    },
    {
      kind: 'handoff',
      author: NODE_1,
      body: 'Images Docker et CI passées sur Node 24, aucun test rouge.',
      at: ago(35 * DAY),
    },
    {
      kind: 'system',
      author: { system: 'lifecycle' },
      body: 'Workspace fermé par Brice.',
      at: ago(35 * DAY),
    },
  ]),
}

export const WORKSPACE_FIXTURES: readonly WorkspaceFixture[] = [
  MIGRATION_AUTH,
  REFONTE_RECHERCHE,
  PERF_LCP_HOME,
  UPGRADE_NODE,
]
