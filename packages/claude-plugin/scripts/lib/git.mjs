// @ts-check
/** Repo courant : racine locale (`git rev-parse`) et nom `owner/name` (remote `origin`). */
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

const GIT_TIMEOUT_MS = 1500

/**
 * @typedef {object} Git
 * @property {(cwd: string) => string | null} repoRoot
 * @property {(root: string) => string | null} remoteUrl
 */

/**
 * @param {string[]} args
 * @returns {string | null}
 */
function git(args) {
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return output === '' ? null : output
  } catch {
    return null
  }
}

/** @type {Git} */
export const systemGit = {
  repoRoot: (cwd) => git(['-C', cwd, 'rev-parse', '--show-toplevel']),
  remoteUrl: (root) => git(['-C', root, 'remote', 'get-url', 'origin']),
}

/**
 * `owner/name` depuis une URL de remote (`git@github.com:o/n.git`, `https://h/o/n`, `ssh://git@h/o/n.git`).
 * @param {string} url
 * @returns {string | null}
 */
export function parseRemote(url) {
  const path = url
    .trim()
    .replace(/\.git$/, '')
    .replace(/^[^:]+:\/\/[^/]+\//, '')
    .replace(/^[^@/]+@[^:]+:/, '')
  const segments = path.split('/').filter((segment) => segment !== '')
  const name = segments.at(-1)
  const owner = segments.at(-2)
  return owner !== undefined && name !== undefined ? `${owner}/${name}` : null
}

/**
 * @param {string} root
 * @returns {string} `local/<dossier>` quand le repo n'a pas de remote exploitable
 */
export function localRepoName(root) {
  const name = basename(root).replace(/[^\w.-]+/g, '-') || 'repo'
  return `local/${name}`
}
