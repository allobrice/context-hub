/** Activité des sessions et cycle de vie d'un workspace (SPEC §7, tableau et §7.2). */
import {
  SESSION_ACTIVE_MS,
  WORKSPACE_AUTO_CLOSE_MS,
  WORKSPACE_INACTIVE_MS,
  type Workspace,
  type WorkspaceDisplayStatus,
} from './types.ts'

function elapsedMs(since: string, now: Date): number {
  return now.getTime() - Date.parse(since)
}

/** Une session est active si elle s'est manifestée depuis moins de 5 minutes. */
export function isSessionActive(lastSeenAt: string, now: Date): boolean {
  return elapsedMs(lastSeenAt, now) < SESSION_ACTIVE_MS
}

/** Ouvert → Inactif (7 j sans activité) → Fermé (manuel, ou automatique à 30 j). */
export function deriveWorkspaceStatus(
  workspace: Pick<Workspace, 'status' | 'lastActivityAt'>,
  now: Date,
): WorkspaceDisplayStatus {
  if (workspace.status === 'closed') return 'closed'
  return elapsedMs(workspace.lastActivityAt, now) >= WORKSPACE_INACTIVE_MS ? 'inactive' : 'open'
}

/** Un workspace ouvert sans activité depuis 30 jours est fermé automatiquement. */
export function shouldAutoClose(
  workspace: Pick<Workspace, 'status' | 'lastActivityAt'>,
  now: Date,
): boolean {
  return (
    workspace.status === 'open' &&
    elapsedMs(workspace.lastActivityAt, now) >= WORKSPACE_AUTO_CLOSE_MS
  )
}
