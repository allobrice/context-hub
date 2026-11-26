/** Erreurs métier des Missions, distinguées par `code` (voir `shared/errors.ts`). */
import { DomainError } from '../shared/errors.ts'
import type { TransitionError } from './lifecycle.ts'
import type { MissionRuleViolation } from './review.ts'
import type { RequiredPromptSection } from './template.ts'

export class MissionNotFoundError extends DomainError {
  readonly code = 'MISSION_NOT_FOUND'
  constructor(readonly reference: string) {
    super(`Mission introuvable : ${reference}`)
    this.name = 'MissionNotFoundError'
  }
}

/** Commande refusée par le cycle de vie (statut, acteur, détenteur, échéance, raison…). */
export class MissionTransitionError extends DomainError {
  readonly code = 'MISSION_TRANSITION'
  constructor(readonly refusal: TransitionError) {
    super(
      `Transition refusée : ${refusal.command} sur une mission ${refusal.status} (${refusal.rejection})`,
    )
    this.name = 'MissionTransitionError'
  }
}

/** Création ou modification refusée (gabarit, taille, scan, champs). Aucune valeur secrète. */
export class MissionRuleError extends DomainError {
  readonly code = 'MISSION_RULE'
  constructor(
    readonly violations: readonly MissionRuleViolation[],
    readonly missingSections: readonly RequiredPromptSection[] = [],
  ) {
    super(`Mission refusée : ${violations.join(', ')}`)
    this.name = 'MissionRuleError'
  }
}

/** « Modifier » sur une version de la mission qui n'est plus la dernière. */
export class MissionConflictError extends DomainError {
  readonly code = 'MISSION_CONFLICT'
  constructor(
    readonly slug: string,
    /** `updatedAt` actuel, pour recharger avant de réessayer. */
    readonly updatedAt: string,
  ) {
    super(`Mission modifiée entre-temps : ${slug}`)
    this.name = 'MissionConflictError'
  }
}

/** La session détentrice n'a pas présenté le jeton de réservation remis par `take`. */
export class MissionReservationError extends DomainError {
  readonly code = 'MISSION_RESERVATION'
  constructor(readonly slug: string) {
    super(`Jeton de réservation absent ou invalide pour la mission ${slug}`)
    this.name = 'MissionReservationError'
  }
}

/** Lot inconnu, ou sans aucune mission visible de l'utilisateur. */
export class MissionBatchNotFoundError extends DomainError {
  readonly code = 'MISSION_NOT_FOUND'
  constructor(readonly batchId: string) {
    super(`Lot de missions introuvable : ${batchId}`)
    this.name = 'MissionBatchNotFoundError'
  }
}
