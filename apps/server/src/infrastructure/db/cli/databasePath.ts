import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { MEMORY_DATABASE } from '../connection.ts'

/** Base par défaut, relative à `apps/server` (ignorée par git : `*.db`). */
const DEFAULT_DATABASE_PATH = 'data/context-hub.db'

/** Chemin de la base (`CONTEXT_HUB_DB_PATH`), dont le dossier est créé au besoin. */
export function databasePath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CONTEXT_HUB_DB_PATH?.trim() ?? ''
  const configured = raw === '' ? DEFAULT_DATABASE_PATH : raw
  if (configured === MEMORY_DATABASE) return configured
  const path = resolve(configured)
  mkdirSync(dirname(path), { recursive: true })
  return path
}
