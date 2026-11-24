// @ts-check
/** Client REST minimal du serveur Context Hub (fetch natif, délai court, jamais d'exception). */

/**
 * @typedef {{ kind: 'ok', status: number, body: unknown }
 *   | { kind: 'http-error', status: number, code: string | null, message: string }
 *   | { kind: 'unreachable', reason: string }} ApiResult
 */

/**
 * @typedef {object} Api
 * @property {(path: string, body: unknown, timeoutMs: number) => Promise<ApiResult>} post
 * @property {(path: string, timeoutMs: number) => Promise<ApiResult>} get
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Codes système d'un échec de connexion → libellé. */
const NETWORK_CODES = new Map([
  ['ECONNREFUSED', 'connexion refusée'],
  ['ECONNRESET', 'connexion interrompue'],
  ['ENOTFOUND', 'hôte introuvable'],
  ['EAI_AGAIN', 'hôte introuvable'],
  ['EHOSTUNREACH', 'hôte inaccessible'],
  ['ETIMEDOUT', 'délai dépassé'],
])

/**
 * Raison lisible d'un échec réseau. `fetch` lève un TypeError (« fetch failed ») dont la cause
 * porte le code système ; le délai d'AbortSignal.timeout lève un TimeoutError.
 * @param {unknown} error
 * @returns {string}
 */
export function networkReason(error) {
  if (!(error instanceof Error)) return 'erreur réseau'
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'délai dépassé'
  const cause = error.cause
  const code = isRecord(cause) && typeof cause.code === 'string' ? cause.code : ''
  return NETWORK_CODES.get(code) ?? 'erreur réseau'
}

/**
 * Chemin d'API d'un workspace, slug encodé.
 * @param {string} slug
 * @param {string} [suffix]
 */
export function workspacePath(slug, suffix = '') {
  return `/api/workspaces/${encodeURIComponent(slug)}${suffix}`
}

/**
 * @param {import('./config.mjs').Config} config
 * @param {typeof fetch} fetchImpl
 * @returns {Api}
 */
export function createApi(config, fetchImpl) {
  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} body
   * @param {number} timeoutMs
   * @returns {Promise<ApiResult>}
   */
  async function call(method, path, body, timeoutMs) {
    if (config.token === null) return { kind: 'unreachable', reason: 'CONTEXT_HUB_TOKEN absent' }
    /** @type {Record<string, string>} */
    const headers = { Authorization: `Bearer ${config.token}` }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    try {
      const response = await fetchImpl(`${config.url}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      /** @type {unknown} */
      let parsed = null
      try {
        parsed = await response.json()
      } catch {
        parsed = null
      }
      if (response.ok) return { kind: 'ok', status: response.status, body: parsed }
      return {
        kind: 'http-error',
        status: response.status,
        code: isRecord(parsed) && typeof parsed.code === 'string' ? parsed.code : null,
        message:
          isRecord(parsed) && typeof parsed.message === 'string'
            ? parsed.message
            : `HTTP ${response.status}`,
      }
    } catch (error) {
      return { kind: 'unreachable', reason: networkReason(error) }
    }
  }

  return {
    post: (path, body, timeoutMs) => call('POST', path, body, timeoutMs),
    get: (path, timeoutMs) => call('GET', path, undefined, timeoutMs),
  }
}
