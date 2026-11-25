/** Erreurs métier des Missions, distinguées par `code` (voir `shared/errors.ts`). */
import { DomainError } from '../shared/errors.ts'
import type { TransitionError } from './lifecycle.ts'

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
