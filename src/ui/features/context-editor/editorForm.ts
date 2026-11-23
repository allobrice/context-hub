import type { ContextDetail } from '../../../application/ports/ContextRepository.ts'
import type { LocalDraft } from '../../../application/ports/DraftStorage.ts'
import type { ContextDraftInput, FalsePositive } from '../../../domain/context/editing.ts'
import { generateSlug } from '../../../domain/context/slug.ts'
import type { Scope, ScopeKind } from '../../../domain/context/types.ts'
import { normalizeTagName } from '../../../domain/taxonomy/tags.ts'

/** Équipe par défaut de la portée « Équipe » (seul espace de la démo). */
export const DEFAULT_TEAM = 'allovoisins'

export interface EditorState {
  readonly values: ContextDraftInput
  /** Valeurs du dernier enregistrement serveur : sert à détecter les modifications. */
  readonly saved: ContextDraftInput
  readonly falsePositives: readonly FalsePositive[]
  /** Version publiée sur laquelle l'édition s'appuie (détection de conflit). */
  readonly baseVersion: number | null
  /** L'identifiant n'est plus régénéré depuis le titre dès que l'auteur l'a modifié. */
  readonly slugTouched: boolean
  /** Création : « Choisir une collection… » tant que l'auteur n'a pas choisi. */
  readonly collectionTouched: boolean
  /** Dernier repo saisi, conservé si l'auteur repasse par une autre portée. */
  readonly lastRepo: string
}

export interface EditorContext {
  /** Identifiant encore modifiable (aucune version publiée). */
  readonly slugEditable: boolean
  readonly collectionName: (id: string | null) => string | null
  readonly currentUser: string
}

export type EditorAction =
  | { readonly type: 'title'; readonly title: string }
  | { readonly type: 'slug'; readonly slug: string }
  | { readonly type: 'description' | 'content' | 'versionNote'; readonly value: string }
  | { readonly type: 'collection'; readonly collectionId: string | null }
  | { readonly type: 'scope'; readonly kind: ScopeKind }
  | { readonly type: 'repo'; readonly repo: string }
  | { readonly type: 'add-tag'; readonly tag: string }
  | { readonly type: 'remove-tag'; readonly tag: string }
  | { readonly type: 'false-positive'; readonly falsePositive: FalsePositive }
  | { readonly type: 'restore-local'; readonly local: LocalDraft }
  | {
      readonly type: 'saved'
      readonly values: ContextDraftInput
      readonly baseVersion: number | null
    }
  | { readonly type: 'rebase'; readonly content: string; readonly baseVersion: number }

function withValues(state: EditorState, patch: Partial<ContextDraftInput>): EditorState {
  return { ...state, values: { ...state.values, ...patch } }
}

/** Identifiant régénéré depuis le titre et la collection, tant qu'il est libre et non retouché. */
function regenerateSlug(state: EditorState, context: EditorContext): EditorState {
  if (!context.slugEditable || state.slugTouched) return state
  const { title, collectionId } = state.values
  return withValues(state, {
    slug: generateSlug({ title, collectionName: context.collectionName(collectionId) }),
  })
}

function scopeOf(kind: ScopeKind, state: EditorState, context: EditorContext): Scope {
  switch (kind) {
    case 'personal':
      return { kind, owner: context.currentUser.toLowerCase() }
    case 'project':
      return { kind, repo: state.lastRepo }
    case 'team':
      return { kind, team: DEFAULT_TEAM }
  }
}

export function editorReducer(context: EditorContext) {
  return (state: EditorState, action: EditorAction): EditorState => {
    switch (action.type) {
      case 'title':
        return regenerateSlug(withValues(state, { title: action.title }), context)
      case 'slug':
        return {
          ...withValues(state, { slug: action.slug.trim().toLowerCase() }),
          slugTouched: true,
        }
      case 'description':
      case 'content':
      case 'versionNote':
        return withValues(state, { [action.type]: action.value })
      case 'collection':
        return regenerateSlug(
          { ...withValues(state, { collectionId: action.collectionId }), collectionTouched: true },
          context,
        )
      case 'scope':
        return withValues(state, { scope: scopeOf(action.kind, state, context) })
      case 'repo':
        return {
          ...withValues(state, { scope: { kind: 'project', repo: action.repo } }),
          lastRepo: action.repo,
        }
      case 'add-tag': {
        const tag = normalizeTagName(action.tag)
        return state.values.tags.includes(tag)
          ? state
          : withValues(state, { tags: [...state.values.tags, tag] })
      }
      case 'remove-tag':
        return withValues(state, { tags: state.values.tags.filter((tag) => tag !== action.tag) })
      case 'false-positive':
        return {
          ...state,
          falsePositives: [
            ...state.falsePositives.filter(
              (item) => item.findingKey !== action.falsePositive.findingKey,
            ),
            action.falsePositive,
          ],
        }
      case 'restore-local':
        return {
          ...state,
          values: action.local.draft,
          falsePositives: action.local.falsePositives,
          baseVersion: action.local.baseVersion,
          slugTouched: true,
          collectionTouched: true,
        }
      case 'saved':
        return {
          ...state,
          values: action.values,
          saved: action.values,
          baseVersion: action.baseVersion,
        }
      case 'rebase':
        return {
          ...withValues(state, { content: action.content }),
          baseVersion: action.baseVersion,
        }
    }
  }
}

/** État initial pour éditer un contexte existant : le brouillon s'il existe, sinon la version publiée. */
export function stateFromDetail({ context }: ContextDetail): EditorState {
  const version = context.draft ?? context.publishedVersion
  const values: ContextDraftInput = {
    title: context.title,
    slug: context.slug,
    description: context.description,
    collectionId: context.collectionId,
    tags: context.tags,
    scope: context.scope,
    content: version?.content ?? '',
    versionNote: context.draft?.note ?? '',
  }
  return {
    values,
    saved: values,
    falsePositives: [],
    baseVersion: context.publishedVersion?.number ?? null,
    slugTouched: false,
    collectionTouched: true,
    lastRepo: context.scope.kind === 'project' ? context.scope.repo : '',
  }
}

/** État initial d'une création (maquette 14) : portée Personnel, titre éventuellement prérempli. */
export function newEditorState(currentUser: string, title = ''): EditorState {
  const values: ContextDraftInput = {
    title,
    slug: generateSlug({ title, collectionName: null }),
    description: '',
    collectionId: null,
    tags: [],
    scope: { kind: 'personal', owner: currentUser.toLowerCase() },
    content: '',
    versionNote: '',
  }
  const empty: ContextDraftInput = { ...values, title: '', slug: '' }
  return {
    values,
    saved: empty,
    falsePositives: [],
    baseVersion: null,
    slugTouched: false,
    collectionTouched: false,
    lastRepo: '',
  }
}

/** Modifications non enregistrées sur le serveur. */
export function isDirty(state: EditorState): boolean {
  return JSON.stringify(state.values) !== JSON.stringify(state.saved)
}

/** La copie locale diffère-t-elle de ce qui est affiché ? */
export function differsFrom(local: LocalDraft, state: EditorState): boolean {
  return JSON.stringify(local.draft) !== JSON.stringify(state.values)
}
