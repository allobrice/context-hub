/**
 * Erreur technique d'un adapter (stockage, réseau). Distincte des erreurs métier du domaine :
 * l'UI l'affiche telle quelle avec son code en mono et propose « Réessayer ».
 */
export class RepositoryUnavailableError extends Error {
  constructor(
    /** Code technique, ex. « SQLITE_BUSY ». */
    readonly code: string,
    /** Détail technique, ex. « database is locked ». */
    readonly detail: string,
    /** Identifiant de requête pour le support. */
    readonly requestId: string,
  ) {
    super(`${code}: ${detail}`)
    this.name = 'RepositoryUnavailableError'
  }

  /** « SQLITE_BUSY · database is locked · req 7f3a91 » */
  get summary(): string {
    return `${this.code} · ${this.detail} · req ${this.requestId}`
  }
}

export function isRepositoryUnavailable(error: unknown): error is RepositoryUnavailableError {
  return error instanceof RepositoryUnavailableError
}

/** Jeton absent, invalide ou révoqué (HTTP 401) : l'UI affiche un message dédié, sans réessai. */
export class UnauthorizedError extends Error {
  /** Discriminant : sans lui, un `Error` quelconque serait structurellement un UnauthorizedError. */
  readonly code = 'UNAUTHORIZED'

  constructor() {
    super('Authentification refusée par le serveur Context Hub')
    this.name = 'UnauthorizedError'
  }
}

export function isUnauthorized(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError
}
