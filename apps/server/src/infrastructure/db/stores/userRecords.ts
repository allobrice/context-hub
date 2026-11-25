/** Noms affichés des utilisateurs (`users.name`), joints à la lecture par les stores. */
import { eq, inArray } from 'drizzle-orm'

import type { SyncDb } from '../connection.ts'
import { users } from '../schema.ts'

/** Noms par identifiant ; les identifiants null ou inconnus sont ignorés. */
export function userNamesIn(
  db: SyncDb,
  ids: readonly (string | null)[],
): ReadonlyMap<string, string> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()
  const rows = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, wanted))
    .all()
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Nom d'un utilisateur, ou null s'il n'existe pas. */
export function userNameIn(db: SyncDb, userId: string): string | null {
  return db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ?? null
}
