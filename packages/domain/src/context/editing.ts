import type { DraftRejection } from '../shared/errors.ts'
import { publishBlockers } from './publish.ts'
import { findingKey, hasSecret, scanContent, type ScanFinding } from './scan.ts'
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
  /**
   * Publier comme prompt MCP (SPEC §8.5). Absent : la valeur courante est conservée (un client qui ne
   * connaît pas ce champ ne l'efface pas en enregistrant).
   */
  readonly exposeAsPrompt?: boolean | undefined
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
  /**
   * La portée personnelle est-elle permise à celui qui enregistre ? Seulement pour un nouveau
   * contexte ou pour son auteur : sinon n'importe qui pourrait s'approprier un contexte d'équipe.
   */
  readonly personalScopeAllowed: boolean
}

/** Contrôles d'un brouillon, avant tout enregistrement. */
export function draftRejections(input: ContextDraftInput, check: DraftCheck): DraftRejection[] {
  const reasons: DraftRejection[] = []
  if (check.frozenSlug !== null && input.slug !== check.frozenSlug) reasons.push('slug-frozen')
  else if (!isValidSlug(input.slug)) reasons.push('slug-invalid')
  else if (check.takenSlugs.has(input.slug)) reasons.push('slug-taken')
  if (input.scope.kind === 'project' && input.scope.repo.trim() === '')
    reasons.push('repo-required')
  if (input.scope.kind === 'personal' && !check.personalScopeAllowed)
    reasons.push('personal-scope-forbidden')
  if (input.description.length > DESCRIPTION_MAX_LENGTH) reasons.push('description-too-long')
  return reasons
}

/** Métadonnées publiées avec la version (elles aussi lues par les sessions MCP). */
function metadataText(input: ContextDraftInput): string {
  return [input.title, input.description, input.versionNote, ...input.tags].join('\n')
}

export interface PublishReview {
  readonly reasons: DraftRejection[]
  /** Findings du contenu, hors faux positifs justifiés. */
  readonly findings: ScanFinding[]
}

/**
 * Contrôles d'une publication : ceux du brouillon, le contenu rescanné (une seule fois) et les
 * métadonnées, qui sont scannées aussi : un faux positif ne vaut que pour le contenu.
 */
export function reviewPublication(
  input: ContextDraftInput,
  falsePositives: readonly FalsePositive[],
  check: DraftCheck,
  /** Scan du contenu déjà calculé (évite de scanner deux fois un contenu de 500 000 caractères). */
  scanned: readonly ScanFinding[] = scanContent(input.content),
): PublishReview {
  const findings = remainingFindings(scanned, falsePositives)
  const blockers = publishBlockers(
    {
      title: input.title,
      description: input.description,
      versionNote: input.versionNote,
      exposeAsPrompt: input.exposeAsPrompt,
    },
    findings,
  )
  const metadata: DraftRejection[] = hasSecret(scanContent(metadataText(input)))
    ? ['secret-in-metadata']
    : []
  const reasons = [
    ...new Set<DraftRejection>([...blockers, ...metadata, ...draftRejections(input, check)]),
  ]
  return { reasons, findings }
}

/** Motifs de refus d'une publication (voir `reviewPublication`). */
export function publishRejections(
  input: ContextDraftInput,
  falsePositives: readonly FalsePositive[],
  check: DraftCheck,
): DraftRejection[] {
  return reviewPublication(input, falsePositives, check).reasons
}
