import { isRepositoryUnavailable, isUnauthorized } from '../../application/errors.ts'
import {
  MissionConflictError,
  MissionRuleError,
  MissionTransitionError,
} from '@context-hub/domain/missions/errors.ts'
import type { TransitionRejection } from '@context-hub/domain/missions/lifecycle.ts'
import type { MissionRuleViolation } from '@context-hub/domain/missions/review.ts'
import { PROMPT_SECTION_TITLES } from '@context-hub/domain/missions/template.ts'
import {
  MISSION_MAX_FILES,
  MISSION_MAX_TAGS,
  MISSION_PROMPT_MAX_LENGTH,
  MISSION_SUMMARY_MAX_LENGTH,
  MISSION_TITLE_MAX_LENGTH,
} from '@context-hub/domain/missions/types.ts'
import {
  isDomainError,
  TaxonomyRuleError,
  WorkspaceRuleError,
  type TaxonomyRuleViolation,
  type WorkspaceRuleViolation,
} from '@context-hub/domain/shared/errors.ts'

import { formatInteger } from './format.ts'

const TAXONOMY_MESSAGES: Readonly<Record<TaxonomyRuleViolation, string>> = {
  'system-collection-immutable': '« Sans collection » ne peut être ni renommée ni supprimée.',
  'deletion-target-required': 'Choisissez une collection vers laquelle déplacer les contextes.',
  'deletion-target-invalid': 'La collection cible n’existe plus ou est celle que vous supprimez.',
  'invalid-tag-name': 'Nom de tag invalide : minuscules, chiffres et tirets uniquement.',
  'unknown-tag': 'Ce tag n’existe plus : la liste a peut-être changé entre-temps.',
  'unknown-collection': 'Cette collection n’existe plus : la liste a peut-être changé entre-temps.',
}

const WORKSPACE_MESSAGES: Readonly<Record<WorkspaceRuleViolation, string>> = {
  'slug-invalid': 'Slug invalide : minuscules, chiffres et tirets uniquement.',
  'slug-taken': 'Ce slug est déjà pris par un autre workspace.',
  'title-empty': 'Le titre est obligatoire.',
  'secret-in-metadata': 'Le titre ou l’objectif contient un secret : retirez-le.',
  'entry-empty': 'Le message est vide.',
  'entry-too-long': 'Le message dépasse 4 000 caractères.',
  'area-invalid': 'Zone invalide.',
  'path-invalid': 'Chemin invalide.',
  'repo-required': 'Repo inconnu pour cette session : rejoindre le workspace avec un repo.',
  'repo-not-in-workspace': 'Ce repo n’appartient pas au workspace.',
  'unknown-user': 'Utilisateur inconnu.',
  'unknown-context': 'Un contexte lié n’existe plus ou n’est pas publié.',
  'unknown-claim': 'Ce claim a déjà été libéré ou a expiré.',
  'unknown-entry': 'Cette entrée n’existe pas.',
  'not-claim-holder': 'Seule la session détentrice peut libérer ce claim.',
}

const MISSION_RULE_MESSAGES: Readonly<Record<MissionRuleViolation, string>> = {
  'title-empty': 'Le titre est obligatoire.',
  'control-character': 'Le titre, le résumé, l’origine et les tags tiennent sur une ligne.',
  'title-too-long': `Le titre dépasse ${formatInteger(MISSION_TITLE_MAX_LENGTH)} caractères.`,
  'summary-empty': 'Le résumé est obligatoire.',
  'summary-too-long': `Le résumé dépasse ${formatInteger(MISSION_SUMMARY_MAX_LENGTH)} caractères.`,
  'prompt-too-long': `Le prompt dépasse ${formatInteger(MISSION_PROMPT_MAX_LENGTH)} caractères.`,
  'template-incomplete': 'Le prompt ne suit pas le gabarit.',
  'secret-detected': 'Un secret a été détecté : retirez-le (une mission n’en contient jamais).',
  'suspicious-instruction': 'Le prompt contient une instruction suspecte.',
  'tag-invalid': 'Tag invalide : minuscules, chiffres et tirets uniquement.',
  'too-many-tags': `${formatInteger(MISSION_MAX_TAGS)} tags au plus.`,
  'repo-invalid': 'Repo invalide : format owner/name.',
  'commit-invalid': 'Commit invalide : SHA de 7 à 40 caractères.',
  'path-invalid': 'Chemin de fichier invalide (relatif au repo, sans caractère de shell).',
  'too-many-files': `${formatInteger(MISSION_MAX_FILES)} fichiers au plus.`,
  'slug-taken': 'Impossible de trouver un slug libre pour ce titre.',
  'unknown-context': 'Un contexte lié n’existe plus ou n’est pas publié.',
  'team-required': 'L’équipe est obligatoire pour la portée équipe.',
}

const TRANSITION_MESSAGES: Readonly<Record<TransitionRejection, string>> = {
  'invalid-status': 'Cette action n’est plus possible : la mission a changé de statut.',
  'actor-not-allowed': 'Cette action est réservée à une session.',
  'not-holder': 'Seule la session qui a pris la mission peut faire cette action.',
  'claim-expired': 'La réservation de la session a expiré.',
  'not-due': 'L’échéance n’est pas atteinte.',
  'reason-required': 'Une raison est obligatoire.',
  'summary-required': 'Un résumé du résultat est obligatoire.',
}

/** Message d'une mission refusée : violations, puis sections manquantes du gabarit. */
function missionRuleMessage(error: MissionRuleError): string {
  const missing =
    error.missingSections.length === 0
      ? ''
      : ` Sections manquantes ou vides : ${error.missingSections
          .map((section) => PROMPT_SECTION_TITLES[section])
          .join(', ')}.`
  return error.violations.map((violation) => MISSION_RULE_MESSAGES[violation]).join(' ') + missing
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
  if (error instanceof WorkspaceRuleError) return WORKSPACE_MESSAGES[error.violation]
  if (error instanceof MissionRuleError) return missionRuleMessage(error)
  if (error instanceof MissionTransitionError) return TRANSITION_MESSAGES[error.refusal.rejection]
  if (error instanceof MissionConflictError) {
    return 'La mission a été modifiée entre-temps : rechargez-la avant de réessayer.'
  }
  if (isDomainError(error)) return error.message
  return 'L’opération a échoué. Réessayez dans un instant.'
}

/** Message d'échec d'une mutation TanStack (`mutation.error`), ou null si elle n'a pas échoué. */
export function failureOf(error: unknown): string | null {
  return error === null || error === undefined ? null : failureMessage(error)
}
