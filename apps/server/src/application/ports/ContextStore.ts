import type { FalsePositive } from '@context-hub/domain/context/editing.ts'
import type {
  Context,
  ContextId,
  ContextStatus,
  ContextVersion,
  Scope,
  ScopeKind,
} from '@context-hub/domain/context/types.ts'
import type { LibraryCriteria, Page, StatusCounts } from '@context-hub/domain/library/criteria.ts'

import type { UserId, Viewer } from '../viewer.ts'

export interface ContextSearchResult {
  readonly page: Page<Context>
  /** Compteurs de tous les contextes visibles, indépendants des filtres (en-tête). */
  readonly totals: StatusCounts
}

export interface ContextDetail {
  readonly context: Context
  /** Versions publiées, de la plus récente à la plus ancienne. */
  readonly history: readonly ContextVersion[]
  /** Nom de la collection, ou null pour « Sans collection ». */
  readonly collectionName: string | null
}

/** Métadonnées d'un contexte, réécrites à chaque enregistrement (sans créer de version). */
export interface ContextMetadata {
  readonly slug: string
  readonly title: string
  readonly description: string
  /** null = « Sans collection ». */
  readonly collectionId: string | null
  readonly tags: readonly string[]
  readonly scope: Scope
  /** Publier comme prompt MCP (SPEC §8.5). */
  readonly exposeAsPrompt: boolean
}

/** Révision écrite : brouillon ou nouvelle version publiée. */
export interface RevisionWrite {
  readonly number: number
  readonly content: string
  readonly note: string
  readonly authorId: UserId
  readonly tokenEstimate: number
}

interface WriteAt {
  /** Date de l'écriture (mise à jour du contexte et dernier usage des tags). */
  readonly at: Date
}

export interface CreateContextCommand extends WriteAt {
  readonly id: ContextId
  readonly metadata: ContextMetadata
  readonly draft: RevisionWrite
}

export interface SaveDraftWrite extends WriteAt {
  readonly id: ContextId
  /**
   * Version publiée attendue (null si jamais publié). Vérifiée dans la même transaction que
   * l'écriture : si elle a changé, l'écriture est refusée par VersionConflictError.
   */
  readonly expectedPublishedVersion: number | null
  readonly metadata: ContextMetadata
  readonly draft: RevisionWrite
}

export interface PublishWrite extends WriteAt {
  readonly id: ContextId
  readonly expectedPublishedVersion: number | null
  readonly metadata: ContextMetadata
  readonly version: RevisionWrite
  /** Faux positifs du scan écartés par l'auteur, conservés sur la version. */
  readonly falsePositives: readonly FalsePositive[]
  /**
   * Date du brouillon relu et scanné. Vérifiée dans la transaction : un brouillon enregistré
   * entre-temps refuse la publication (VersionConflictError) au lieu d'être écrasé.
   */
  readonly expectedDraftUpdatedAt: string
}

export interface RestoreDraftWrite extends WriteAt {
  readonly id: ContextId
  readonly draft: RevisionWrite
}

export interface StatusWrite extends WriteAt {
  readonly id: ContextId
  readonly status: ContextStatus
}

/**
 * Contexte publié tel que l'expose MCP : métadonnées PUBLIÉES (jamais celles d'un brouillon),
 * sans le contenu.
 */
export interface PublishedSummary {
  readonly id: ContextId
  readonly slug: string
  readonly title: string
  readonly description: string
  readonly scope: Scope
  readonly version: number
  readonly tokenEstimate: number
  /** Exposé comme prompt MCP (valeur publiée). */
  readonly exposeAsPrompt: boolean
}

export interface PublishedDetail {
  readonly summary: PublishedSummary
  /** Versions publiées (immuables), de la plus récente à la plus ancienne. */
  readonly history: readonly ContextVersion[]
}

export interface PublishedSearch {
  readonly query: string
  /** Tous requis (ET). */
  readonly tags: readonly string[]
  /** Identifiant de collection ; « none » = Sans collection ; null = toutes. */
  readonly collectionId: string | null
  /**
   * Repo du projet appelant (`X-Context-Hub-Repo`), ou null. Filtre de PERTINENCE, pas de sécurité :
   * les contextes `project` de ce repo passent en tête, ceux des autres repos sont exclus.
   */
  readonly repo: string | null
  readonly limit: number
}

/**
 * Persistance des contextes. Toutes les lectures appliquent la visibilité du `viewer`. Chaque
 * écriture est atomique ; les cas d'usage appliquent les règles métier du domaine avant d'écrire.
 */
export interface ContextStore {
  search(viewer: Viewer, criteria: LibraryCriteria): Promise<ContextSearchResult>
  /** Par identifiant ou slug ; null si inconnu ou hors de portée. */
  find(viewer: Viewer, reference: string): Promise<ContextDetail | null>
  /** Slugs utilisés par d'autres contextes que `exceptId`, toutes portées confondues. */
  isSlugTaken(slug: string, exceptId: ContextId | null): Promise<boolean>
  countByScope(viewer: Viewer): Promise<Readonly<Record<ScopeKind, number>>>
  /** L'utilisateur est-il l'auteur (créateur) du contexte ? */
  isAuthor(id: ContextId, userId: UserId): Promise<boolean>
  collectionExists(id: string): Promise<boolean>
  /** Contextes publiés visibles (jamais les brouillons ni les archivés), triés par slug. */
  listPublished(viewer: Viewer): Promise<readonly PublishedSummary[]>
  /**
   * Contextes publiés visibles parmi `ids` (portée PUBLIÉE ; inconnus, brouillons, archivés et hors
   * portée absents), triés par slug. Coût proportionnel au nombre d'identifiants.
   */
  findPublishedByIds(viewer: Viewer, ids: readonly string[]): Promise<readonly PublishedSummary[]>
  /** Un contexte publié par slug, selon sa portée PUBLIÉE ; null s'il n'est pas servi. */
  findPublished(viewer: Viewer, slug: string): Promise<PublishedDetail | null>
  /** Recherche plein texte sur le contenu PUBLIÉ uniquement, par pertinence. */
  searchPublished(viewer: Viewer, search: PublishedSearch): Promise<readonly PublishedSummary[]>

  create(command: CreateContextCommand): Promise<void>
  /** @throws VersionConflictError si la version publiée n'est plus celle attendue. */
  saveDraft(write: SaveDraftWrite): Promise<void>
  /**
   * Insère la version (immuable), la désigne comme publiée et supprime le brouillon.
   * @throws VersionConflictError si la version publiée n'est plus celle attendue.
   */
  publish(write: PublishWrite): Promise<void>
  /** Remplace le brouillon sans toucher aux métadonnées (restauration d'une version). */
  restoreDraft(write: RestoreDraftWrite): Promise<void>
  setStatus(write: StatusWrite): Promise<void>
}
