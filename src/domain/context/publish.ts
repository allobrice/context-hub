import { hasSecret, type ScanFinding } from './scan.ts'
import { DESCRIPTION_MAX_LENGTH } from './types.ts'

/** Ce qu'il faut savoir d'un brouillon pour décider s'il est publiable. */
export interface PublishCandidate {
  readonly title: string
  readonly description: string
  readonly versionNote: string
}

export type PublishBlocker =
  'secret-detected' | 'title-empty' | 'version-note-empty' | 'description-too-long'

/**
 * Raisons qui empêchent la publication, dans l'ordre où l'UI doit les exposer.
 * `findings` doit déjà exclure les faux positifs (voir `activeFindings`).
 */
export function publishBlockers(
  candidate: PublishCandidate,
  findings: readonly ScanFinding[],
): PublishBlocker[] {
  const blockers: PublishBlocker[] = []
  if (hasSecret(findings)) blockers.push('secret-detected')
  if (candidate.title.trim() === '') blockers.push('title-empty')
  if (candidate.versionNote.trim() === '') blockers.push('version-note-empty')
  if (candidate.description.length > DESCRIPTION_MAX_LENGTH) blockers.push('description-too-long')
  return blockers
}

/** Faux si un secret est détecté, si le titre est vide ou si la note de version est vide (SPEC §2). */
export function canPublish(candidate: PublishCandidate, findings: readonly ScanFinding[]): boolean {
  return publishBlockers(candidate, findings).length === 0
}
