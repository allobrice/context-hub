import { describe, expect, it, vi } from 'vitest'

import type { LocalDraft } from '../../application/ports/DraftStorage.ts'
import { LocalDraftStorage } from './LocalDraftStorage.ts'

const draft: LocalDraft = {
  draft: {
    title: 'Titre',
    slug: 'nuxt/titre',
    description: '',
    collectionId: null,
    tags: ['nuxt'],
    scope: { kind: 'project', repo: 'allovoisins/front' },
    content: '# Titre',
    versionNote: '',
  },
  falsePositives: [{ findingKey: 'secret:1:sk_live_', reason: 'clé de démo' }],
  baseVersion: 4,
  savedAt: '2026-11-23T11:12:00+01:00',
}

describe('LocalDraftStorage', () => {
  it('enregistre, relit et efface une copie locale', () => {
    const storage = new LocalDraftStorage()
    storage.save('ctx-1', draft)
    expect(storage.load('ctx-1')).toEqual(draft)
    storage.clear('ctx-1')
    expect(storage.load('ctx-1')).toBeNull()
  })

  it('ignore une donnée corrompue ou modifiée à la main', () => {
    localStorage.setItem('context-hub:draft:x', '{pas du json')
    localStorage.setItem('context-hub:draft:y', JSON.stringify({ ...draft, baseVersion: 'quatre' }))
    const storage = new LocalDraftStorage()
    expect(storage.load('x')).toBeNull()
    expect(storage.load('y')).toBeNull()
  })

  it('ne jette jamais si le stockage est indisponible', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const storage = new LocalDraftStorage()
    expect(() => {
      storage.save('ctx-1', draft)
    }).not.toThrow()
  })
})
