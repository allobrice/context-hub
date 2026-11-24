/**
 * Client typé de l'API Context Hub, généré depuis le contrat OpenAPI (`openapi.d.ts`) : aucun
 * code serveur n'est importé. Les erreurs de l'API sont traduites en erreurs du domaine, pour que
 * l'UI les traite exactement comme celles de l'adapter in-memory.
 */
import createClient from 'openapi-fetch'

import { RepositoryUnavailableError, UnauthorizedError } from '../../application/errors.ts'
import {
  ClaimConflictError,
  ContextNotFoundError,
  DraftRejectedError,
  TaxonomyRuleError,
  VersionConflictError,
  WorkspaceClosedError,
  WorkspaceForbiddenError,
  WorkspaceRuleError,
} from '@context-hub/domain/shared/errors.ts'
import { toClaim } from './mappers.ts'
import type { components, paths } from './openapi.d.ts'

export type ApiClient = ReturnType<typeof createClient<paths>>

type Schemas = components['schemas']

/** Toutes les erreurs que l'API peut renvoyer, au format unique `{ code, message, details? }`. */
export type ApiErrorBody =
  | Schemas['UnauthorizedError']
  | Schemas['ForbiddenOriginError']
  | Schemas['NotFoundError']
  | Schemas['VersionConflictError']
  | Schemas['NoDraftError']
  | Schemas['DraftRejectedError']
  | Schemas['TaxonomyRuleError']
  | Schemas['WorkspaceForbiddenError']
  | Schemas['WorkspaceClosedError']
  | Schemas['ClaimConflictError']
  | Schemas['WorkspaceRuleError']
  | Schemas['ValidationError']
  | Schemas['InternalError']

/**
 * Codes d'erreur connus du contrat. Liste locale plutôt que `API_ERROR_CODES` du domaine : le module
 * de schémas embarquerait Zod dans le bundle principal du front.
 */
const API_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorBody['code']>([
  'UNAUTHORIZED',
  'FORBIDDEN_ORIGIN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'NO_DRAFT',
  'DRAFT_REJECTED',
  'TAXONOMY_RULE',
  'WORKSPACE_FORBIDDEN',
  'WORKSPACE_CLOSED',
  'CLAIM_CONFLICT',
  'WORKSPACE_RULE',
  'VALIDATION_FAILED',
  'INTERNAL',
])

export interface ApiClientOptions {
  /** '' en dev (même origine, proxy Vite `/api`), URL complète sinon. */
  readonly baseUrl: string
  /** En-têtes ajoutés à chaque requête (tests : jeton). Le front n'en envoie pas : le proxy s'en charge. */
  readonly headers?: Readonly<Record<string, string>>
  readonly fetch?: typeof globalThis.fetch
}

export function createApiClient({ baseUrl, headers, fetch }: ApiClientOptions): ApiClient {
  return createClient<paths>({
    baseUrl,
    ...(headers ? { headers: { ...headers } } : {}),
    ...(fetch ? { fetch } : {}),
  })
}

const REQUEST_ID_HEADER = 'X-Request-Id'

function requestIdOf(response: Response | undefined): string {
  return response?.headers.get(REQUEST_ID_HEADER)?.slice(0, 8) ?? '—'
}

/** Traduit une erreur de l'API en erreur du domaine (ou technique). */
export function toError(body: ApiErrorBody, response: Response): Error {
  switch (body.code) {
    case 'UNAUTHORIZED':
      return new UnauthorizedError()
    case 'NOT_FOUND':
      return new ContextNotFoundError(body.details.reference, body.details.requestId.slice(0, 8))
    case 'VERSION_CONFLICT':
      return new VersionConflictError(
        body.details.baseVersion,
        body.details.latestVersion,
        body.details.latest ?? undefined,
      )
    case 'DRAFT_REJECTED':
      return new DraftRejectedError(body.details.reasons, body.details.findings)
    case 'TAXONOMY_RULE':
      return new TaxonomyRuleError(body.details.violation)
    case 'WORKSPACE_FORBIDDEN':
      return new WorkspaceForbiddenError(body.details.slug)
    case 'WORKSPACE_CLOSED':
      return new WorkspaceClosedError(body.details.slug)
    case 'CLAIM_CONFLICT':
      return new ClaimConflictError(toClaim(body.details.claim))
    case 'WORKSPACE_RULE':
      return new WorkspaceRuleError(body.details.violation)
    case 'FORBIDDEN_ORIGIN':
    case 'NO_DRAFT':
    case 'VALIDATION_FAILED':
    case 'INTERNAL':
      return new RepositoryUnavailableError(
        `HTTP ${response.status}`,
        body.message,
        requestIdOf(response),
      )
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    API_ERROR_CODES.has(value.code) &&
    'message' in value
  )
}

/** Résultat d'un appel `openapi-fetch`. */
interface ApiResult<T> {
  readonly data?: T
  readonly error?: unknown
  readonly response: Response
}

function unavailable(response: Response, detail: string): RepositoryUnavailableError {
  return new RepositoryUnavailableError(`HTTP ${response.status}`, detail, requestIdOf(response))
}

/**
 * Attend un appel et renvoie son résultat s'il a réussi, sinon lève l'erreur correspondante :
 * erreur métier (404, 409, 422), UnauthorizedError (401), RepositoryUnavailableError sinon
 * (réseau, 5xx, corps d'erreur inattendu).
 */
async function settle<T>(call: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  let result: ApiResult<T>
  try {
    result = await call
  } catch (error) {
    throw new RepositoryUnavailableError(
      'NETWORK',
      error instanceof Error ? error.message : 'Serveur injoignable',
      '—',
    )
  }
  const { error, response } = result
  if (response.ok) return result
  if (response.status === 401) throw new UnauthorizedError()
  if (!isApiErrorBody(error))
    throw unavailable(response, response.statusText || 'Erreur du serveur')
  try {
    throw toError(error, response)
  } catch (mapped) {
    // Un corps d'erreur mal formé (champ `details` absent…) reste une erreur technique.
    throw mapped instanceof TypeError ? unavailable(response, error.message) : mapped
  }
}

/** Données d'une réponse réussie (une réponse vide est une erreur technique). */
export async function unwrap<T>(call: Promise<ApiResult<T>>): Promise<T> {
  const { data, response } = await settle(call)
  if (data === undefined) throw unavailable(response, 'Réponse vide')
  return data
}

/** Réponse réussie sans corps (204). */
export async function unwrapEmpty(call: Promise<ApiResult<unknown>>): Promise<void> {
  await settle(call)
}
