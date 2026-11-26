/**
 * Portée en base (colonnes `*_scope_kind` / `*_scope_value`), partagée par les contextes et les
 * missions : `personal` réservée à son propriétaire, `team` et `project` visibles de tous.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

import type { Scope, ScopeKind } from '@context-hub/domain/context/types.ts'

import type { Viewer } from '../../../application/viewer.ts'

export interface ScopeColumns {
  readonly kind: AnyColumn
  readonly value: AnyColumn
}

/** Condition SQL : la ligne est visible du `viewer`. */
export function visibleIn(columns: ScopeColumns, viewer: Viewer): SQL {
  return sql`(${columns.kind} <> 'personal' or ${columns.value} = ${viewer.userId})`
}

export function scopeOf(kind: ScopeKind, value: string): Scope {
  switch (kind) {
    case 'personal':
      return { kind, owner: value }
    case 'project':
      return { kind, repo: value }
    case 'team':
      return { kind, team: value }
  }
}

export function scopeColumns(scope: Scope): { scopeKind: ScopeKind; scopeValue: string } {
  switch (scope.kind) {
    case 'personal':
      return { scopeKind: scope.kind, scopeValue: scope.owner }
    case 'project':
      return { scopeKind: scope.kind, scopeValue: scope.repo }
    case 'team':
      return { scopeKind: scope.kind, scopeValue: scope.team }
  }
}
