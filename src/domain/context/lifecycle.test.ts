import { describe, expect, it } from 'vitest'

import { aContext, aVersion } from '../test-utils/fixtures.ts'
import { canArchive, nextDraftNumber, restoreAsDraft, unarchivedStatus } from './lifecycle.ts'

const history = [
  aVersion({ number: 4, content: 'v4' }),
  aVersion({ number: 3, content: 'v3', tokenEstimate: 9 }),
]

describe('archivage', () => {
  it('n’archive pas un contexte déjà archivé', () => {
    expect(canArchive({ status: 'published' })).toBe(true)
    expect(canArchive({ status: 'draft' })).toBe(true)
    expect(canArchive({ status: 'archived' })).toBe(false)
  })

  it('désarchive vers publié ou brouillon selon la présence d’une version publiée', () => {
    expect(unarchivedStatus({ publishedVersion: aVersion() })).toBe('published')
    expect(unarchivedStatus({ publishedVersion: null })).toBe('draft')
  })
})

describe('nextDraftNumber', () => {
  it('réutilise le numéro du brouillon en cours', () => {
    expect(nextDraftNumber(aContext({ draft: aVersion({ number: 5 }) }), history)).toBe(5)
  })

  it('sinon, dernière version + 1', () => {
    expect(
      nextDraftNumber(
        aContext({ draft: null, publishedVersion: aVersion({ number: 4 }) }),
        history,
      ),
    ).toBe(5)
    expect(nextDraftNumber(aContext({ draft: null, publishedVersion: null }), [])).toBe(1)
  })
})

describe('restoreAsDraft', () => {
  it('copie le contenu de la version dans un brouillon, sans publier', () => {
    const draft = restoreAsDraft({
      context: aContext({ draft: null, publishedVersion: aVersion({ number: 4 }) }),
      history,
      versionNumber: 3,
      author: 'Brice',
      at: '2026-11-23T11:12:00+01:00',
    })
    expect(draft).toEqual({
      number: 5,
      content: 'v3',
      note: 'Restauration de la v3',
      author: 'Brice',
      createdAt: '2026-11-23T11:12:00+01:00',
      tokenEstimate: 9,
    })
  })

  it('remplace le brouillon en cours en gardant son numéro', () => {
    const draft = restoreAsDraft({
      context: aContext({ draft: aVersion({ number: 5 }) }),
      history,
      versionNumber: 4,
      author: 'Brice',
      at: 'x',
    })
    expect(draft?.number).toBe(5)
  })

  it('retourne null pour une version inconnue', () => {
    expect(
      restoreAsDraft({ context: aContext(), history, versionNumber: 9, author: 'Brice', at: 'x' }),
    ).toBeNull()
  })
})
