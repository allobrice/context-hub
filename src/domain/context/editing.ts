import type { DraftRejection } from '../shared/errors.ts'
import { publishBlockers } from './publish.ts'
import { findingKey, scanContent, type ScanFinding } from './scan.ts'
import { isValidSlug } from './slug.ts'
import { DESCRIPTION_MAX_LENGTH, type Scope } from './types.ts'

/** Ce que l'auteur saisit dans l'éditeur : métadonnées du contexte + contenu et note de la version. */
export interface ContextDraftInput {
  readonly title: string
  readonly slug: string
  readonly description: string
  /** null = « Sans collection ». */
  readonly collectionId: string | null
  readonly tags: readonly string[]
  readonly scope: Scope
  readonly content: string
  readonly versionNote: string
}

/** Finding écarté par l'auteur, avec sa justification (conservée pour la relecture côté serveur). */
export interface FalsePositive {
  readonly findingKey: string
  readonly reason: string
}

/** Findings restants une fois retirés les faux positifs déclarés. */
export function remainingFindings(
  findings: readonly ScanFinding[],
  falsePositives: readonly FalsePositive[],
): ScanFinding[] {
  const ignored = new Set(falsePositives.map((item) => item.findingKey))
  return findings.filter((finding) => !ignored.has(findingKey(finding)))
}

/** Un faux positif ne vaut que s'il est justifié. */
export function isValidFalsePositiveReason(reason: string): boolean {
  return reason.trim().length >= 3
}

/** Titre court pour le fil d'Ariane : « Conventions Nuxt 4 — composables… » → « Conventions Nuxt 4 ». */
export function shortTitle(title: string): string {
  const [head = ''] = title.split(/\s+[—–-]\s+/u)
  return head.trim() || title
}

export interface DraftCheck {
  /** Slugs déjà utilisés par d'autres contextes. */
  readonly takenSlugs: ReadonlySet<string>
  /** Slug figé (contexte déjà publié), ou null s'il est encore modifiable. */
  readonly frozenSlug: string | null
}

/** Contrôles d'un brouillon, avant tout enregistrement. */
export function draftRejections(input: ContextDraftInput, check: DraftCheck): DraftRejection[] {
  const reasons: DraftRejection[] = []
  if (check.frozenSlug !== null && input.slug !== check.frozenSlug) reasons.push('slug-frozen')
  else if (!isValidSlug(input.slug)) reasons.push('slug-invalid')
  else if (check.takenSlugs.has(input.slug)) reasons.push('slug-taken')
  if (input.scope.kind === 'project' && input.scope.repo.trim() === '')
    reasons.push('repo-required')
  if (input.description.length > DESCRIPTION_MAX_LENGTH) reasons.push('description-too-long')
  return reasons
}

/** Contrôles d'une publication : ceux du brouillon + canPublish sur le contenu rescanné. */
export function publishRejections(
  input: ContextDraftInput,
  falsePositives: readonly FalsePositive[],
  check: DraftCheck,
): DraftRejection[] {
  const findings = remainingFindings(scanContent(input.content), falsePositives)
  const blockers = publishBlockers(
    { title: input.title, description: input.description, versionNote: input.versionNote },
    findings,
  )
  return [...new Set<DraftRejection>([...blockers, ...draftRejections(input, check)])]
}
