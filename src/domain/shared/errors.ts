/**
 * Erreurs métier typées. L'UI les distingue par `code` (union discriminée),
 * jamais par le texte du message.
 */
export type DomainErrorCode =
  'CONTEXT_NOT_FOUND' | 'VERSION_CONFLICT' | 'DRAFT_REJECTED' | 'TAXONOMY_RULE'

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode
}

export class ContextNotFoundError extends DomainError {
  readonly code = 'CONTEXT_NOT_FOUND'
  constructor(
    /** Identifiant ou slug demandé. */
    readonly reference: string,
    /** Identifiant de requête pour le support, si l'adapter en fournit un. */
    readonly requestId?: string,
  ) {
    super(`Contexte introuvable : ${reference}`)
    this.name = 'ContextNotFoundError'
  }
}

/** Version publiée entre-temps par quelqu'un d'autre. */
export interface ConcurrentVersion {
  readonly number: number
  readonly author: string
  readonly createdAt: string
  readonly content: string
}

/** Le brouillon a été enregistré au-dessus d'une version qui n'est plus la dernière. */
export class VersionConflictError extends DomainError {
  readonly code = 'VERSION_CONFLICT'
  constructor(
    readonly baseVersion: number,
    readonly latestVersion: number,
    /** La version qui a pris la place, pour comparer ou repartir d'elle. */
    readonly latest?: ConcurrentVersion,
  ) {
    super(
      `Conflit de version : brouillon basé sur la v${baseVersion}, dernière version v${latestVersion}`,
    )
    this.name = 'VersionConflictError'
  }
}

/** Raisons de refus d'un brouillon ou d'une publication, revérifiées côté serveur (qui fait autorité). */
export type DraftRejection =
  | 'secret-detected'
  | 'title-empty'
  | 'version-note-empty'
  | 'description-too-long'
  | 'slug-invalid'
  | 'slug-taken'
  | 'slug-frozen'
  | 'repo-required'

export class DraftRejectedError extends DomainError {
  readonly code = 'DRAFT_REJECTED'
  constructor(readonly reasons: readonly DraftRejection[]) {
    super(`Brouillon refusé : ${reasons.join(', ')}`)
    this.name = 'DraftRejectedError'
  }
}

export type TaxonomyRuleViolation =
  | 'system-collection-immutable'
  | 'deletion-target-required'
  | 'deletion-target-invalid'
  | 'invalid-tag-name'
  | 'unknown-tag'
  | 'unknown-collection'

export class TaxonomyRuleError extends DomainError {
  readonly code = 'TAXONOMY_RULE'
  constructor(readonly violation: TaxonomyRuleViolation) {
    super(`Règle de taxonomie violée : ${violation}`)
    this.name = 'TaxonomyRuleError'
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
