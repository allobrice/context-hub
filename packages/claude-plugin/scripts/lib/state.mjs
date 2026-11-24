// @ts-check
/**
 * État de la session Claude Code rattachée à un workspace :
 * `<CLAUDE_PLUGIN_DATA>/sessions/<session_id>.json`. La clé est le `session_id` de Claude Code
 * (identique dans les hooks et dans `${CLAUDE_SESSION_ID}`) : deux sessions d'un même repo restent
 * distinctes.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isRecord } from './api.mjs'

/** Un `session_id` sûr dans un nom de fichier (pas de « / » ni de « .. »). */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

/**
 * @typedef {object} SessionState
 * @property {1} version
 * @property {string} workspace slug du workspace
 * @property {string} label label de la session (ex. web-1)
 * @property {string} repo `owner/name`
 * @property {string} repoRoot racine locale du repo (chemins relatifs des claims)
 * @property {number} cursor prochain `seq` à injecter
 * @property {string} joinedAt
 */

/**
 * @param {unknown} value
 * @returns {value is SessionState}
 */
function isSessionState(value) {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.workspace === 'string' &&
    typeof value.label === 'string' &&
    typeof value.repo === 'string' &&
    typeof value.repoRoot === 'string' &&
    typeof value.cursor === 'number' &&
    typeof value.joinedAt === 'string'
  )
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @returns {string | null} null si le `session_id` n'est pas un nom de fichier sûr
 */
export function statePath(dataDir, sessionId) {
  return SESSION_ID_PATTERN.test(sessionId) ? join(dataDir, 'sessions', `${sessionId}.json`) : null
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @returns {SessionState | null}
 */
export function readState(dataDir, sessionId) {
  const path = statePath(dataDir, sessionId)
  if (path === null) return null
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return isSessionState(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Écriture atomique (fichier temporaire puis renommage).
 * @param {string} dataDir
 * @param {string} sessionId
 * @param {SessionState} state
 */
export function writeState(dataDir, sessionId, state) {
  const path = statePath(dataDir, sessionId)
  if (path === null) return
  mkdirSync(join(dataDir, 'sessions'), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 })
  renameSync(temporary, path)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 */
export function deleteState(dataDir, sessionId) {
  const path = statePath(dataDir, sessionId)
  if (path !== null) rmSync(path, { force: true })
}
