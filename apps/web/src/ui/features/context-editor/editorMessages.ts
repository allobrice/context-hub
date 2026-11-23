import type { DraftRejection } from '@context-hub/domain/shared/errors.ts'
import { formatRelativeDate } from '../../lib/format.ts'

const REJECTION_LABELS: Readonly<Record<DraftRejection, string>> = {
  'secret-detected': 'secret potentiel détecté',
  'title-empty': 'titre requis',
  'version-note-empty': 'note de version requise',
  'description-too-long': 'description trop longue (160 caractères max.)',
  'slug-invalid': 'identifiant invalide (minuscules, chiffres, tirets, « / »)',
  'slug-taken': 'identifiant déjà utilisé par un autre contexte',
  'slug-frozen': 'identifiant figé depuis la v1',
  'repo-required': 'repo requis pour la portée Projet',
}

export const SLUG_REJECTIONS: ReadonlySet<DraftRejection> = new Set([
  'slug-invalid',
  'slug-taken',
  'slug-frozen',
])

export function rejectionLabel(reason: DraftRejection): string {
  return REJECTION_LABELS[reason]
}

/** « titre requis · note de version requise » */
export function describeRejections(reasons: readonly DraftRejection[]): string {
  return reasons.map(rejectionLabel).join(' · ')
}

export interface SaveStatusInput {
  readonly pending: boolean
  readonly conflict: boolean
  readonly isNew: boolean
  readonly dirty: boolean
  readonly savedLocally: boolean
  /** Date du brouillon enregistré sur le serveur, s'il existe. */
  readonly draftSavedAt: string | null
  readonly now: Date
}

/** Libellé d'état de l'en-tête (maquettes 12–15). */
export function saveStatusLabel(input: SaveStatusInput): string {
  if (input.pending) return 'Enregistrement…'
  if (input.conflict) return 'Non enregistré'
  if (input.isNew && !input.dirty) return 'Pas encore enregistré'
  if (input.dirty)
    return input.savedLocally ? 'Modifications conservées localement' : 'Non enregistré'
  if (input.draftSavedAt)
    return `Brouillon enregistré ${formatRelativeDate(input.draftSavedAt, input.now)}`
  return 'Aucune modification'
}
