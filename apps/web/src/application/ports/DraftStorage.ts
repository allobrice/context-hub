import type { ContextDraftInput, FalsePositive } from '@context-hub/domain/context/editing.ts'

/** Copie locale d'un brouillon (autosave, conflit de version) : survit au rechargement de la page. */
export interface LocalDraft {
  readonly draft: ContextDraftInput
  readonly falsePositives: readonly FalsePositive[]
  readonly baseVersion: number | null
  readonly savedAt: string
}

export interface DraftStorage {
  /** null si absente ou illisible (donnée externe : toujours validée). */
  load(key: string): LocalDraft | null
  save(key: string, draft: LocalDraft): void
  clear(key: string): void
}
