import { describe, expect, it } from 'vitest'

import { aContext, aVersion } from '../test-utils/fixtures.ts'
import { currentVersion, listedVersion, scopeTarget } from './types.ts'

describe('scopeTarget', () => {
  it('renvoie le propriétaire, le repo ou l’équipe', () => {
    expect(scopeTarget({ kind: 'personal', owner: 'brice' })).toBe('brice')
    expect(scopeTarget({ kind: 'project', repo: 'allovoisins/front' })).toBe('allovoisins/front')
    expect(scopeTarget({ kind: 'team', team: 'allovoisins' })).toBe('allovoisins')
  })
})

describe('currentVersion', () => {
  it('privilégie le brouillon sur la version publiée', () => {
    const draft = aVersion({ number: 5 })
    const ctx = aContext({ publishedVersion: aVersion({ number: 4 }), draft })
    expect(currentVersion(ctx)).toBe(draft)
    expect(listedVersion(ctx)?.number).toBe(4)
  })

  it('gère un contexte jamais publié', () => {
    const ctx = aContext({ publishedVersion: null, draft: null, status: 'draft' })
    expect(currentVersion(ctx)).toBeNull()
    expect(
      listedVersion(aContext({ publishedVersion: null, draft: aVersion({ number: 2 }) }))?.number,
    ).toBe(2)
  })
})
