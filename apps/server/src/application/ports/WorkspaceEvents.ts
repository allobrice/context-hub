import type { UserId } from '../viewer.ts'

/** Nouvelle entrée dans un workspace : relayée en `notifications/resources/updated` aux membres. */
export interface WorkspaceChanged {
  readonly slug: string
  /** Seuls les membres sont notifiés (le slug d'un workspace n'est pas public). */
  readonly memberIds: readonly UserId[]
}

export type WorkspaceEventListener = (event: WorkspaceChanged) => void

export interface WorkspaceEvents {
  emit(event: WorkspaceChanged): void
  /** @returns une fonction de désabonnement */
  subscribe(listener: WorkspaceEventListener): () => void
}
