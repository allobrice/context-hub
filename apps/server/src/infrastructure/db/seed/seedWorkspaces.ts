/**
 * Workspaces de démo (maquettes 23 à 30). Les dates des fixtures sont relatives à `DEMO_NOW` : elles
 * sont décalées sur le « maintenant » du seed, pour que les claims, l'activité des sessions et le
 * statut « Inactif » gardent le sens des maquettes quel que soit le jour où l'on seede.
 */
import { DEMO_NOW } from '@context-hub/domain/fixtures/now.ts'
import {
  WORKSPACE_FIXTURES,
  type WorkspaceFixture,
} from '@context-hub/domain/fixtures/workspaces.ts'
import { isSystemAuthor, type WorkspaceEntry } from '@context-hub/domain/workspaces/types.ts'

import type { SyncDb } from '../connection.ts'
import {
  workspaceClaims,
  workspaceEntries,
  workspaceLinkedContexts,
  workspaceMembers,
  workspaceParticipants,
  workspaces,
} from '../schema.ts'

const CLAIM_TTL_MINUTES = 30

function shifter(now: Date): (iso: string) => string {
  const offset = now.getTime() - Date.parse(DEMO_NOW)
  return (iso) => new Date(Date.parse(iso) + offset).toISOString()
}

function entryRow(entry: WorkspaceEntry, shift: (iso: string) => string) {
  const session = isSystemAuthor(entry.author) ? null : entry.author
  return {
    workspaceId: entry.workspaceId,
    seq: entry.seq,
    kind: entry.kind,
    body: entry.body,
    files: JSON.stringify(entry.files),
    authorUserId: session?.userId ?? null,
    authorSessionLabel: session?.sessionLabel ?? null,
    authorRepo: session?.repo ?? null,
    systemSource: isSystemAuthor(entry.author) ? entry.author.system : null,
    redactions: entry.redactions,
    suspicious: entry.suspicious,
    createdAt: shift(entry.createdAt),
  }
}

function seedWorkspace(
  db: SyncDb,
  fixture: WorkspaceFixture,
  shift: (iso: string) => string,
): void {
  const { workspace } = fixture
  db.insert(workspaces)
    .values({
      id: workspace.id,
      slug: workspace.slug,
      title: workspace.title,
      goal: workspace.goal,
      status: workspace.status,
      repos: JSON.stringify(workspace.repos),
      createdBy: workspace.createdBy,
      createdAt: shift(workspace.createdAt),
      lastActivityAt: shift(workspace.lastActivityAt),
      closedAt: workspace.closedAt === null ? null : shift(workspace.closedAt),
      closedBy: workspace.closedAt === null ? null : workspace.createdBy,
      nextSeq: fixture.entries.length + 1,
    })
    .run()
  for (const member of fixture.members) {
    db.insert(workspaceMembers)
      .values({ workspaceId: workspace.id, ...member, addedAt: shift(member.addedAt) })
      .run()
  }
  workspace.linkedContextIds.forEach((contextId, position) => {
    db.insert(workspaceLinkedContexts)
      .values({ workspaceId: workspace.id, contextId, position })
      .run()
  })
  for (const entry of fixture.entries)
    db.insert(workspaceEntries).values(entryRow(entry, shift)).run()
  for (const claim of fixture.claims) {
    db.insert(workspaceClaims)
      .values({
        id: claim.id,
        workspaceId: claim.workspaceId,
        repo: claim.repo,
        area: claim.area,
        holderUserId: claim.holder.userId,
        holderSessionLabel: claim.holder.sessionLabel,
        holderRepo: claim.holder.repo,
        acquiredAt: shift(claim.acquiredAt),
        expiresAt: shift(claim.expiresAt),
        ttlMinutes: CLAIM_TTL_MINUTES,
      })
      .run()
  }
  for (const participant of fixture.participants) {
    db.insert(workspaceParticipants)
      .values({
        workspaceId: participant.workspaceId,
        userId: participant.session.userId,
        sessionLabel: participant.session.sessionLabel,
        repo: participant.session.repo,
        joinedAt: shift(participant.joinedAt),
        lastSeenAt: shift(participant.lastSeenAt),
        cursor: participant.cursor,
      })
      .run()
  }
}

/** À appeler dans la transaction du seed de démo, après les utilisateurs et les contextes. */
export function seedWorkspaces(db: SyncDb, now: Date): void {
  const shift = shifter(now)
  for (const fixture of WORKSPACE_FIXTURES) seedWorkspace(db, fixture, shift)
}
