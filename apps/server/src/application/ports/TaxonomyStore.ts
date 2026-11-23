import type { ContextStatus } from '@context-hub/domain/context/types.ts'
import type { Collection, Tag } from '@context-hub/domain/taxonomy/types.ts'

import type { Viewer } from '../viewer.ts'

export interface CollectionInput {
  readonly name: string
  readonly description: string
}

/** Tags et statut d'un contexte : ce qu'il faut pour chiffrer l'impact d'une fusion. */
export interface TagAssignment {
  readonly tags: readonly string[]
  readonly status: ContextStatus
}

export interface TagReplacement {
  /** Tags remplacés (le tag cible peut en faire partie : il est alors conservé). */
  readonly sources: readonly string[]
  readonly target: string
  readonly at: Date
}

export interface CollectionRemoval {
  readonly deletedId: string
  /** null = déplacer vers « Sans collection ». */
  readonly targetId: string | null
  /** Ancien nom de la collection ajouté en tag aux contextes déplacés, ou null. */
  readonly tagToAdd: string | null
  readonly at: Date
}

/**
 * Taxonomie (SPEC §5.4). Les compteurs ne portent que sur les contextes visibles du `viewer`.
 * Renommer, fusionner ou supprimer met à jour tous les contextes concernés, sans créer de version.
 */
export interface TaxonomyStore {
  listTags(viewer: Viewer): Promise<readonly Tag[]>
  /** Parmi `names`, ceux qui n'existent pas dans le registre. */
  unknownTags(names: readonly string[]): Promise<readonly string[]>
  /** Tous les contextes, toutes portées : une fusion les modifie tous. */
  tagAssignments(): Promise<readonly TagAssignment[]>
  /** Fusion ou renommage : `sources` sont remplacés par `target` (créé au besoin, sans doublon). */
  replaceTags(replacement: TagReplacement): Promise<void>
  /** Retire les tags de tous les contextes et du registre. */
  deleteTags(names: readonly string[]): Promise<void>

  listCollections(viewer: Viewer): Promise<readonly Collection[]>
  createCollection(input: CollectionInput): Promise<Collection>
  /** false si la collection n'existe pas ou est la collection système (non renommable). */
  updateCollection(id: string, input: CollectionInput): Promise<boolean>
  /** Déplace les contextes vers la cible, puis supprime la collection. */
  deleteCollection(removal: CollectionRemoval): Promise<void>
}
