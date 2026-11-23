import type { Context, ContextStatus, ContextVersion } from './types.ts'

/** Un contexte archivé n'est plus lu par les sessions MCP ; il peut être désarchivé. */
export function canArchive(context: Pick<Context, 'status'>): boolean {
  return context.status !== 'archived'
}

/** Statut retrouvé au désarchivage : publié s'il a une version publiée, sinon brouillon. */
export function unarchivedStatus(context: Pick<Context, 'publishedVersion'>): ContextStatus {
  return context.publishedVersion ? 'published' : 'draft'
}

/** Numéro du prochain brouillon : celui du brouillon en cours, sinon la dernière version + 1. */
export function nextDraftNumber(
  context: Pick<Context, 'draft' | 'publishedVersion'>,
  history: readonly ContextVersion[],
): number {
  if (context.draft) return context.draft.number
  const latest = Math.max(
    0,
    context.publishedVersion?.number ?? 0,
    ...history.map((version) => version.number),
  )
  return latest + 1
}

export interface RestoreRequest {
  readonly context: Pick<Context, 'draft' | 'publishedVersion'>
  readonly history: readonly ContextVersion[]
  readonly versionNumber: number
  readonly author: string
  readonly at: string
}

/**
 * Restaurer une ancienne version = la copier dans le brouillon (décision phase 0), sans publier.
 * Le brouillon en cours, s'il existe, est remplacé (l'UI le confirme avant).
 * Retourne null si la version n'existe pas dans l'historique.
 */
export function restoreAsDraft({
  context,
  history,
  versionNumber,
  author,
  at,
}: RestoreRequest): ContextVersion | null {
  const source = history.find((version) => version.number === versionNumber)
  if (!source) return null
  return {
    number: nextDraftNumber(context, history),
    content: source.content,
    note: `Restauration de la v${versionNumber}`,
    author,
    createdAt: at,
    tokenEstimate: source.tokenEstimate,
  }
}
