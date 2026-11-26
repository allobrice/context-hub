import type { Brand } from '../shared/brand.ts'

export type ContextId = Brand<string, 'ContextId'>

/** Ex. « nuxt/conventions-nuxt-4 ». Unique, figé après la v1. */
export type Slug = string

export type Scope =
  | { readonly kind: 'personal'; readonly owner: string }
  | { readonly kind: 'project'; readonly repo: string }
  | { readonly kind: 'team'; readonly team: string }

export type ScopeKind = Scope['kind']

export const SCOPE_KINDS = ['personal', 'project', 'team'] as const satisfies readonly ScopeKind[]

export type ContextStatus = 'draft' | 'published' | 'archived'

export const CONTEXT_STATUSES = [
  'published',
  'draft',
  'archived',
] as const satisfies readonly ContextStatus[]

/** Version immuable d'un contexte. */
export interface ContextVersion {
  readonly number: number
  readonly content: string
  readonly note: string
  readonly author: string
  readonly createdAt: string
  readonly tokenEstimate: number
}

export interface Context {
  readonly id: ContextId
  readonly slug: Slug
  readonly title: string
  /** ≤ 160 caractères (DESCRIPTION_MAX_LENGTH). */
  readonly description: string
  readonly collectionId: string | null
  readonly tags: readonly string[]
  readonly scope: Scope
  readonly status: ContextStatus
  /** Version lue par les sessions MCP. */
  readonly publishedVersion: ContextVersion | null
  /** Révision en cours au-dessus de la version publiée. */
  readonly draft: ContextVersion | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly author: string
  readonly mcpReads7d: number
  /**
   * Modèle réutilisable : publié comme prompt MCP (slash command `/mcp__context-hub__<nom>`), SPEC §8.5.
   * Déclenché par un humain, jamais une mission. Ne vaut qu'une fois publié.
   */
  readonly exposeAsPrompt: boolean
}

export const DESCRIPTION_MAX_LENGTH = 160

/** Construit un ContextId. Seul point de « cast » du brand. */
export function toContextId(value: string): ContextId {
  return value as ContextId
}

/** Repo, équipe ou propriétaire selon la portée. */
export function scopeTarget(scope: Scope): string {
  switch (scope.kind) {
    case 'personal':
      return scope.owner
    case 'project':
      return scope.repo
    case 'team':
      return scope.team
  }
}

/** Version affichée dans les listes : la version publiée (celle que lisent les sessions), sinon le brouillon. */
export function listedVersion(context: Context): ContextVersion | null {
  return context.publishedVersion ?? context.draft
}

/** Version courante d'un contexte : le brouillon s'il existe, sinon la version publiée. */
export function currentVersion(context: Context): ContextVersion | null {
  return context.draft ?? context.publishedVersion
}
