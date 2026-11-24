import type { ScanFinding } from '../context/scan.ts'
import type { Claim } from '../workspaces/types.ts'

/**
 * Erreurs métier typées. L'UI les distingue par `code` (union discriminée),
 * jamais par le texte du message.
 */
export type DomainErrorCode =
  | 'CONTEXT_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DRAFT_REJECTED'
  | 'TAXONOMY_RULE'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_FORBIDDEN'
  | 'WORKSPACE_CLOSED'
  | 'CLAIM_CONFLICT'
  | 'WORKSPACE_RULE'

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
  /** Seul l'auteur d'un contexte peut le rendre personnel (sinon : prise de contrôle). */
  | 'personal-scope-forbidden'
  /** Secret détecté dans le titre, la description, la note de version ou les tags. */
  | 'secret-in-metadata'

export const DRAFT_REJECTIONS = [
  'secret-detected',
  'title-empty',
  'version-note-empty',
  'description-too-long',
  'slug-invalid',
  'slug-taken',
  'slug-frozen',
  'repo-required',
  'personal-scope-forbidden',
  'secret-in-metadata',
] as const satisfies readonly DraftRejection[]

export class DraftRejectedError extends DomainError {
  readonly code = 'DRAFT_REJECTED'
  constructor(
    readonly reasons: readonly DraftRejection[],
    /** Findings du scan refait par le serveur (hors faux positifs justifiés), pour l'éditeur. */
    readonly findings: readonly ScanFinding[] = [],
  ) {
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

export const TAXONOMY_RULE_VIOLATIONS = [
  'system-collection-immutable',
  'deletion-target-required',
  'deletion-target-invalid',
  'invalid-tag-name',
  'unknown-tag',
  'unknown-collection',
] as const satisfies readonly TaxonomyRuleViolation[]

export class TaxonomyRuleError extends DomainError {
  readonly code = 'TAXONOMY_RULE'
  constructor(readonly violation: TaxonomyRuleViolation) {
    super(`Règle de taxonomie violée : ${violation}`)
    this.name = 'TaxonomyRuleError'
  }
}

export class WorkspaceNotFoundError extends DomainError {
  readonly code = 'WORKSPACE_NOT_FOUND'
  constructor(readonly slug: string) {
    super(`Workspace introuvable : ${slug}`)
    this.name = 'WorkspaceNotFoundError'
  }
}

/** Seuls les membres d'un workspace (créateur et invités) y accèdent. */
export class WorkspaceForbiddenError extends DomainError {
  readonly code = 'WORKSPACE_FORBIDDEN'
  constructor(readonly slug: string) {
    super(`Accès refusé au workspace ${slug}`)
    this.name = 'WorkspaceForbiddenError'
  }
}

/** Écriture dans un workspace fermé (lecture seule). */
export class WorkspaceClosedError extends DomainError {
  readonly code = 'WORKSPACE_CLOSED'
  constructor(readonly slug: string) {
    super(`Workspace fermé (lecture seule) : ${slug}`)
    this.name = 'WorkspaceClosedError'
  }
}

/** La zone demandée chevauche un claim actif d'une autre session. */
export class ClaimConflictError extends DomainError {
  readonly code = 'CLAIM_CONFLICT'
  constructor(readonly claim: Claim) {
    super(
      `Zone déjà réservée : ${claim.area} (${claim.repo}) par ${claim.holder.sessionLabel} jusqu’à ${claim.expiresAt}`,
    )
    this.name = 'ClaimConflictError'
  }
}

export type WorkspaceRuleViolation =
  | 'slug-invalid'
  | 'slug-taken'
  | 'title-empty'
  | 'secret-in-metadata'
  | 'entry-empty'
  | 'entry-too-long'
  | 'area-invalid'
  | 'path-invalid'
  | 'repo-required'
  | 'repo-not-in-workspace'
  | 'unknown-user'
  | 'unknown-context'
  | 'unknown-claim'
  | 'unknown-entry'
  | 'not-claim-holder'

export const WORKSPACE_RULE_VIOLATIONS = [
  'slug-invalid',
  'slug-taken',
  'title-empty',
  'secret-in-metadata',
  'entry-empty',
  'entry-too-long',
  'area-invalid',
  'path-invalid',
  'repo-required',
  'repo-not-in-workspace',
  'unknown-user',
  'unknown-context',
  'unknown-claim',
  'unknown-entry',
  'not-claim-holder',
] as const satisfies readonly WorkspaceRuleViolation[]

export class WorkspaceRuleError extends DomainError {
  readonly code = 'WORKSPACE_RULE'
  constructor(readonly violation: WorkspaceRuleViolation) {
    super(`Règle de workspace violée : ${violation}`)
    this.name = 'WorkspaceRuleError'
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
