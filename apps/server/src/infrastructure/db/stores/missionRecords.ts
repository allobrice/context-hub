/**
 * Écriture des missions partagée par le store et le seed : domaine → colonnes, tags, journal.
 * Le cycle de vie (`transition`) n'est jamais appliqué ici : seulement la persistance.
 */
import type { Mission, MissionEvent } from '@context-hub/domain/missions/types.ts'

import type { SyncDb } from '../connection.ts'
import type { missions } from '../schema.ts'
import { missionEvents, missionTags } from '../schema.ts'
import { scopeColumns } from './scopeRecords.ts'

/** Colonnes qui changent au fil du cycle de vie (tout sauf l'identité et le jeton). */
export function lifecycleColumns(mission: Mission) {
  const { claim, freshness, validation } = mission
  return {
    status: mission.status,
    expiresAt: mission.expiresAt,
    updatedAt: mission.updatedAt,
    closedAt: mission.closedAt,
    validationBy: validation?.by ?? null,
    validationAt: validation?.at ?? null,
    claimUserId: claim?.session.userId ?? null,
    claimSessionLabel: claim?.session.sessionLabel ?? null,
    claimRepo: claim?.session.repo ?? null,
    claimAcquiredAt: claim?.acquiredAt ?? null,
    claimExpiresAt: claim?.expiresAt ?? null,
    freshnessCheckedAt: freshness?.checkedAt ?? null,
    freshnessChangedFiles: freshness === null ? null : JSON.stringify(freshness.changedFiles),
    freshnessUserId: freshness?.checkedBy.userId ?? null,
    freshnessSessionLabel: freshness?.checkedBy.sessionLabel ?? null,
    freshnessRepo: freshness?.checkedBy.repo ?? null,
    result: mission.result === null ? null : JSON.stringify(mission.result),
    dropReason: mission.dropReason,
  }
}

/** Ligne complète d'une mission (création, seed), sans jeton de réservation. */
export function missionRow(mission: Mission): typeof missions.$inferInsert {
  const { scopeKind, scopeValue } = scopeColumns(mission.scope)
  return {
    ...lifecycleColumns(mission),
    id: mission.id,
    slug: mission.slug,
    title: mission.title,
    summary: mission.summary,
    prompt: mission.prompt,
    priority: mission.priority,
    scopeKind,
    scopeValue,
    originLabel: mission.origin.label,
    originBatchId: mission.origin.batchId,
    originUserId: mission.origin.session?.userId ?? null,
    originSessionLabel: mission.origin.session?.sessionLabel ?? null,
    originRepo: mission.origin.session?.repo ?? null,
    createdBy: mission.origin.createdBy,
    codeRefRepo: mission.codeRef.repo,
    codeRefCommit: mission.codeRef.commit,
    codeRefFiles: JSON.stringify(mission.codeRef.files),
    linkedContextIds: JSON.stringify(mission.linkedContextIds),
    workspaceId: mission.workspaceId,
    suspicious: mission.suspicious,
    createdAt: mission.createdAt,
    claimTokenHash: null,
  }
}

export function insertTags(db: SyncDb, missionId: string, tags: readonly string[]): void {
  if (tags.length === 0) return
  db.insert(missionTags)
    .values(tags.map((tag, position) => ({ missionId, tag, position })))
    .run()
}

/** Ajoute un événement au journal append-only. */
export function appendEvent(db: SyncDb, event: MissionEvent): void {
  const { actor } = event
  // `MissionEventActor` n'a pas de discriminant : session = a un label, humain = `userId` seul,
  // job = `system`. À revoir si une variante gagne l'un de ces champs.
  const session = 'sessionLabel' in actor ? actor : null
  db.insert(missionEvents)
    .values({
      missionId: event.missionId,
      missionSlug: event.missionSlug,
      missionTitle: event.missionTitle,
      at: event.at,
      type: event.type,
      actorUserId: 'userId' in actor ? actor.userId : null,
      actorSessionLabel: session?.sessionLabel ?? null,
      actorRepo: session?.repo ?? null,
      actorSystem: 'system' in actor ? actor.system : null,
      detail: event.detail,
    })
    .run()
}
