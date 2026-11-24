/**
 * Journal chargé côté UI : fusion incrémentale des pages (polling `since`, pagination `before`).
 * Les entrées sont indexées par `seq` : une entrée reçue deux fois n'est gardée qu'une fois.
 */
import type { WorkspaceEntry } from '@context-hub/domain/workspaces/types.ts'

/** Taille d'une page du journal (chargement initial et « entrées précédentes »). */
export const JOURNAL_PAGE_SIZE = 20

export interface JournalState {
  /** Entrées chargées, de la plus récente à la plus ancienne. */
  readonly entries: readonly WorkspaceEntry[]
  /** Des entrées plus anciennes restent à charger. */
  readonly hasOlder: boolean
}

export const EMPTY_JOURNAL: JournalState = { entries: [], hasOlder: false }

/** Ajoute des entrées (dans n'importe quel ordre), sans doublon, triées de la plus récente à la plus ancienne. */
export function mergeEntries(
  state: JournalState,
  incoming: readonly WorkspaceEntry[],
): JournalState {
  if (incoming.length === 0) return state
  const bySeq = new Map(state.entries.map((entry) => [entry.seq, entry]))
  for (const entry of incoming) bySeq.set(entry.seq, entry)
  return { ...state, entries: [...bySeq.values()].sort((a, b) => b.seq - a.seq) }
}

/** Prochain `seq` à demander au polling. */
export function nextSeqOf(state: JournalState): number {
  return (state.entries[0]?.seq ?? 0) + 1
}

/** `seq` le plus ancien chargé (borne `before` de la page précédente), ou null. */
export function oldestSeqOf(state: JournalState): number | null {
  return state.entries.at(-1)?.seq ?? null
}

/** Plage des entrées précédentes encore à charger : « #1–#41 ». */
export function olderRangeLabel(state: JournalState): string | null {
  const oldest = oldestSeqOf(state)
  if (!state.hasOlder || oldest === null || oldest <= 1) return null
  return oldest - 1 === 1 ? '#1' : `#1–#${oldest - 1}`
}
