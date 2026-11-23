/**
 * Journal structuré. Les champs ne portent que des métadonnées (méthode, route, statut, durée,
 * identifiants) : JAMAIS de contenu de contexte, de corps de requête ni de jeton.
 */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>

export interface Logger {
  info(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
}
