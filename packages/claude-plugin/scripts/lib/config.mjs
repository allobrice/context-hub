// @ts-check
/**
 * Configuration lue dans l'environnement de Claude Code (hérité par les hooks).
 * - CONTEXT_HUB_URL : URL du serveur (défaut http://127.0.0.1:8787) ;
 * - CONTEXT_HUB_TOKEN : jeton d'API (obligatoire) ;
 * - CONTEXT_HUB_FAIL_MODE : `open` (défaut : serveur injoignable → avertir sans bloquer) ou `closed` ;
 * - CONTEXT_HUB_REPO : repo `owner/name` imposé (sinon déduit de `git remote get-url origin`) ;
 * - CLAUDE_PLUGIN_DATA : dossier de données du plugin (fourni par Claude Code).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_URL = 'http://127.0.0.1:8787'
export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

/**
 * @typedef {object} Config
 * @property {string} url
 * @property {string | null} token
 * @property {'open' | 'closed'} failMode
 * @property {string | null} repoOverride
 * @property {string} dataDir
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Config}
 */
export function readConfig(env) {
  const token = env.CONTEXT_HUB_TOKEN?.trim() ?? ''
  const repo = env.CONTEXT_HUB_REPO?.trim() ?? ''
  const dataDir = env.CLAUDE_PLUGIN_DATA?.trim() ?? ''
  const url = env.CONTEXT_HUB_URL?.trim() ?? ''
  return {
    url: (url === '' ? DEFAULT_URL : url).replace(/\/+$/, ''),
    token: token === '' ? null : token,
    failMode: env.CONTEXT_HUB_FAIL_MODE?.trim() === 'closed' ? 'closed' : 'open',
    repoOverride: REPO_PATTERN.test(repo) ? repo : null,
    dataDir: dataDir === '' ? join(homedir(), '.context-hub') : dataDir,
  }
}
