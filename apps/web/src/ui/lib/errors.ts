import { isRepositoryUnavailable, isUnauthorized } from '../../application/errors.ts'
import {
  isDomainError,
  TaxonomyRuleError,
  type TaxonomyRuleViolation,
} from '@context-hub/domain/shared/errors.ts'

const TAXONOMY_MESSAGES: Readonly<Record<TaxonomyRuleViolation, string>> = {
  'system-collection-immutable': '« Sans collection » ne peut être ni renommée ni supprimée.',
  'deletion-target-required': 'Choisissez une collection vers laquelle déplacer les contextes.',
  'deletion-target-invalid': 'La collection cible n’existe plus ou est celle que vous supprimez.',
  'invalid-tag-name': 'Nom de tag invalide : minuscules, chiffres et tirets uniquement.',
  'unknown-tag': 'Ce tag n’existe plus : la liste a peut-être changé entre-temps.',
  'unknown-collection': 'Cette collection n’existe plus : la liste a peut-être changé entre-temps.',
}

export const UNAUTHORIZED_TITLE = 'Accès refusé par le serveur Context Hub'

/** Message du 401 : jeton absent, invalide ou révoqué. */
export const UNAUTHORIZED_MESSAGE =
  'Le jeton d’API est absent, invalide ou révoqué. En local, vérifiez CONTEXT_HUB_DEV_TOKEN dans apps/web/.env.local puis relancez le serveur Vite.'

/** Code technique à afficher en mono sous une erreur (stockage), ou undefined. */
export function technicalCode(error: unknown): string | undefined {
  return isRepositoryUnavailable(error) ? error.summary : undefined
}

/** Message lisible pour l'échec d'une opération (mutation). */
export function failureMessage(error: unknown): string {
  if (isUnauthorized(error)) return `${UNAUTHORIZED_TITLE}. ${UNAUTHORIZED_MESSAGE}`
  if (isRepositoryUnavailable(error))
    return `Le stockage n’a pas répondu (${error.summary}). Rien n’a été modifié.`
  if (error instanceof TaxonomyRuleError) return TAXONOMY_MESSAGES[error.violation]
  if (isDomainError(error)) return error.message
  return 'L’opération a échoué. Réessayez dans un instant.'
}

/** Message d'échec d'une mutation TanStack (`mutation.error`), ou null si elle n'a pas échoué. */
export function failureOf(error: unknown): string | null {
  return error === null || error === undefined ? null : failureMessage(error)
}
