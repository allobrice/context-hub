import { sql } from 'drizzle-orm'

import { queryTerms } from '@context-hub/domain/library/criteria.ts'

import type { SyncDb } from '../connection.ts'
import type { ContextSearchIndex, SearchDocument, SearchScope } from './ContextSearchIndex.ts'

/** Colonne interrogée par la recherche MCP : le texte publié seulement. */
const PUBLISHED_COLUMN = 'published_text'

const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u

/**
 * Expression MATCH FTS5 : chaque terme est une chaîne entre guillemets (aucun opérateur FTS5 ne peut
 * être injecté), recherchée en préfixe (« nux » trouve « nuxt »), tous les termes requis (ET).
 * null si la recherche ne contient aucun mot.
 */
export function toMatchExpression(query: string, scope: SearchScope): string | null {
  const terms = queryTerms(query)
    .filter((term) => HAS_WORD_CHARACTER.test(term))
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
  if (terms.length === 0) return null
  const expression = terms.join(' AND ')
  return scope === 'published' ? `${PUBLISHED_COLUMN} : (${expression})` : expression
}

function isContextIdRow(row: unknown): row is { context_id: string } {
  return (
    typeof row === 'object' &&
    row !== null &&
    'context_id' in row &&
    typeof row.context_id === 'string'
  )
}

/** Index FTS5 (`context_search`, migration `0003`), tokenizer unicode61 sans accents. */
export class Fts5SearchIndex implements ContextSearchIndex {
  upsert(db: SyncDb, document: SearchDocument): void {
    db.run(sql`DELETE FROM context_search WHERE context_id = ${document.contextId}`)
    db.run(sql`
      INSERT INTO context_search (context_id, current_text, published_text)
      VALUES (${document.contextId}, ${document.currentText}, ${document.publishedText ?? ''})`)
  }

  isEmpty(db: SyncDb): boolean {
    return db.all(sql`SELECT 1 FROM context_search LIMIT 1`).length === 0
  }

  match(db: SyncDb, query: string, scope: SearchScope): string[] {
    const expression = toMatchExpression(query, scope)
    if (expression === null) return []
    const rows: unknown[] = db.all(
      sql`SELECT context_id FROM context_search WHERE context_search MATCH ${expression} ORDER BY rank`,
    )
    return rows.filter(isContextIdRow).map((row) => row.context_id)
  }
}
