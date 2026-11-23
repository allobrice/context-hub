import type { Brand } from '@context-hub/domain/shared/brand.ts'

/** Identifiant d'un utilisateur (ex. « brice »). C'est aussi le propriétaire d'une portée `personal`. */
export type UserId = Brand<string, 'UserId'>

/** Construit un UserId. Seul point de « cast » du brand. */
export function toUserId(value: string): UserId {
  return value as UserId
}

export interface User {
  readonly id: UserId
  readonly name: string
}

/**
 * Utilisateur authentifié pour qui une lecture est faite. Les portées sont appliquées côté serveur :
 * `personal` n'est visible que de son propriétaire ; `team` et `project` le sont de tout utilisateur
 * authentifié (une seule équipe en v1).
 */
export interface Viewer {
  readonly userId: UserId
}
