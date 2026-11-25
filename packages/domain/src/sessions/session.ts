/**
 * Identité d'une session Claude Code (ou de l'UI), partagée par les Workspaces (SPEC §7) et les
 * Missions (SPEC §8).
 */

/**
 * Une session Claude Code (ou l'UI, label « ui ») : ex. `web-1 · allovoisins/front`.
 * `userName` n'est pas dans le modèle de la SPEC : l'UI affiche « Brice · allovoisins/api ».
 */
export interface SessionRef {
  readonly userId: string
  readonly userName: string
  readonly sessionLabel: string
  readonly repo: string | null
}

export const SESSION_LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/

/** Label de session de l'UI : une écriture humaine est publiée comme `<user> · ui`. */
export const UI_SESSION_LABEL = 'ui'

/** Une session est active si elle s'est manifestée depuis moins de 5 minutes. */
export const SESSION_ACTIVE_MS = 5 * 60 * 1000

/** Même session : même utilisateur et même label (deux sessions d'un même repo restent distinctes). */
export function isSameSession(
  a: { readonly userId: string; readonly sessionLabel: string },
  b: { readonly userId: string; readonly sessionLabel: string },
): boolean {
  return a.userId === b.userId && a.sessionLabel === b.sessionLabel
}

export function isSessionActive(lastSeenAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(lastSeenAt) < SESSION_ACTIVE_MS
}
