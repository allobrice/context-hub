/**
 * Session qui écrit (Workspaces, Missions) : l'utilisateur vient du jeton authentifié, le label et le
 * repo sont déclarés par la session (le plugin les déduit de son état et du remote git).
 */
import type { UserId, Viewer } from './viewer.ts'

export interface SessionKey {
  readonly userId: UserId
  readonly sessionLabel: string
  readonly repo: string | null
}

/** Ce que la session déclare dans sa requête (REST ou MCP). */
export interface SessionInput {
  readonly session: string
  readonly repo: string | null
}

export function sessionKey(viewer: Viewer, input: SessionInput): SessionKey {
  return { userId: viewer.userId, sessionLabel: input.session, repo: input.repo }
}
