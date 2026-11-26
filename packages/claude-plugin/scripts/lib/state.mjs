// @ts-check
/**
 * État de la session Claude Code : workspace rejoint (`<CLAUDE_PLUGIN_DATA>/sessions/<session_id>.json`)
 * et mission prise (`<CLAUDE_PLUGIN_DATA>/missions/<session_id>.json`). La clé est le `session_id` de Claude Code
 * (identique dans les hooks et dans `${CLAUDE_SESSION_ID}`) : deux sessions d'un même repo restent
 * distinctes.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
 * @property {string[]} [unverified] fichiers écrits pendant que le serveur était injoignable
 *   (fail-open), à signaler au prochain prompt synchronisé
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
    typeof value.joinedAt === 'string' &&
    (value.unverified === undefined ||
      (Array.isArray(value.unverified) &&
        value.unverified.every((path) => typeof path === 'string')))
  )
}

/**
 * @typedef {object} MissionState
 * @property {1} version
 * @property {string} slug mission prise par cette session
 * @property {string} token jeton de réservation remis par le serveur (à présenter pour agir)
 * @property {string} label label de session sous lequel la mission a été prise
 * @property {string} repo `owner/name` de la session
 * @property {string} takenAt
 */

/**
 * @param {unknown} value
 * @returns {value is MissionState}
 */
function isMissionState(value) {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.slug === 'string' &&
    typeof value.token === 'string' &&
    typeof value.label === 'string' &&
    typeof value.repo === 'string' &&
    typeof value.takenAt === 'string'
  )
}

/** Un fichier d'état par session et par sorte : `sessions/` (workspace), `missions/` (mission prise). */
/** @typedef {'sessions' | 'missions'} StateKind */

/**
 * @param {string} dataDir
 * @param {StateKind} kind
 * @param {string} sessionId
 * @returns {string | null} null si le `session_id` n'est pas un nom de fichier sûr
 */
function pathOf(dataDir, kind, sessionId) {
  return SESSION_ID_PATTERN.test(sessionId) ? join(dataDir, kind, `${sessionId}.json`) : null
}

/**
 * @template T
 * @param {string | null} path
 * @param {(value: unknown) => value is T} guard
 * @returns {T | null}
 */
function readJson(path, guard) {
  if (path === null) return null
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return guard(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Écriture atomique (fichier temporaire puis renommage), lisible par l'utilisateur seul : l'état
 * d'une mission contient son jeton de réservation.
 * @param {string | null} path
 * @param {unknown} value
 */
function writeJson(path, value) {
  if (path === null) return
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 })
  renameSync(temporary, path)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @returns {string | null} null si le `session_id` n'est pas un nom de fichier sûr
 */
function statePath(dataDir, sessionId) {
  return pathOf(dataDir, 'sessions', sessionId)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @returns {SessionState | null}
 */
export function readState(dataDir, sessionId) {
  return readJson(statePath(dataDir, sessionId), isSessionState)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @param {SessionState} state
 */
export function writeState(dataDir, sessionId, state) {
  writeJson(statePath(dataDir, sessionId), state)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 */
export function deleteState(dataDir, sessionId) {
  const path = statePath(dataDir, sessionId)
  if (path !== null) rmSync(path, { force: true })
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @returns {MissionState | null}
 */
export function readMissionState(dataDir, sessionId) {
  return readJson(pathOf(dataDir, 'missions', sessionId), isMissionState)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 * @param {MissionState} state
 */
export function writeMissionState(dataDir, sessionId, state) {
  writeJson(pathOf(dataDir, 'missions', sessionId), state)
}

/**
 * @param {string} dataDir
 * @param {string} sessionId
 */
export function deleteMissionState(dataDir, sessionId) {
  const path = pathOf(dataDir, 'missions', sessionId)
  if (path !== null) rmSync(path, { force: true })
}
