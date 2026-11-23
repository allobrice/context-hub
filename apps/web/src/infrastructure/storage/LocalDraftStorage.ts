import type { DraftStorage, LocalDraft } from '../../application/ports/DraftStorage.ts'
import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'

const PREFIX = 'context-hub:draft:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isScope(value: unknown): value is ContextDraftInput['scope'] {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'personal':
      return typeof value.owner === 'string'
    case 'project':
      return typeof value.repo === 'string'
    case 'team':
      return typeof value.team === 'string'
    default:
      return false
  }
}

function isDraftInput(value: unknown): value is ContextDraftInput {
  return (
    isRecord(value) &&
    ['title', 'slug', 'description', 'content', 'versionNote'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    (value.collectionId === null || typeof value.collectionId === 'string') &&
    isStringArray(value.tags) &&
    isScope(value.scope)
  )
}

/** Garde de type : localStorage est une source externe, modifiable à la main. */
export function isLocalDraft(value: unknown): value is LocalDraft {
  return (
    isRecord(value) &&
    isDraftInput(value.draft) &&
    Array.isArray(value.falsePositives) &&
    value.falsePositives.every(
      (item) =>
        isRecord(item) && typeof item.findingKey === 'string' && typeof item.reason === 'string',
    ) &&
    (value.baseVersion === null || typeof value.baseVersion === 'number') &&
    typeof value.savedAt === 'string'
  )
}

/** Copie locale des brouillons dans localStorage ; toute erreur de stockage est absorbée (SPEC §3). */
export class LocalDraftStorage implements DraftStorage {
  constructor(private readonly storage: () => Storage = () => window.localStorage) {}

  load(key: string): LocalDraft | null {
    try {
      const raw = this.storage().getItem(PREFIX + key)
      if (raw === null) return null
      const parsed: unknown = JSON.parse(raw)
      return isLocalDraft(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  save(key: string, draft: LocalDraft): void {
    try {
      this.storage().setItem(PREFIX + key, JSON.stringify(draft))
    } catch {
      // Quota ou stockage bloqué : la copie locale est un filet, pas une garantie.
    }
  }

  clear(key: string): void {
    try {
      this.storage().removeItem(PREFIX + key)
    } catch {
      // Idem.
    }
  }
}
