import type { ContextStatus, ScopeKind } from '@context-hub/domain/context/types.ts'

export const STATUS_LABELS: Readonly<Record<ContextStatus, string>> = {
  published: 'Publié',
  draft: 'Brouillon',
  archived: 'Archivé',
}

export const SCOPE_LABELS: Readonly<Record<ScopeKind, string>> = {
  personal: 'Personnel',
  project: 'Projet',
  team: 'Équipe',
}
