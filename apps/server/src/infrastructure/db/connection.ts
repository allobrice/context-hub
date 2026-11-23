import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import * as schema from './schema.ts'

export type Schema = typeof schema
export type AppDatabase = BetterSQLite3Database<Schema>
/** Base ou transaction synchrone (better-sqlite3) : les deux s'utilisent de la même façon. */
export type SyncDb = BaseSQLiteDatabase<'sync', Database.RunResult, Schema>

export const MEMORY_DATABASE = ':memory:'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url))

export interface DatabaseHandle {
  readonly db: AppDatabase
  readonly close: () => void
}

/** Ouvre la base (fichier ou `:memory:`), active les clés étrangères et applique les migrations. */
export function openDatabase(filename: string): DatabaseHandle {
  const client = new Database(filename)
  if (filename !== MEMORY_DATABASE) client.pragma('journal_mode = WAL')
  client.pragma('foreign_keys = ON')
  client.pragma('busy_timeout = 5000')
  const db = drizzle({ client, schema })
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return { db, close: () => client.close() }
}
