import { describe, expect, it } from 'vitest'

import { toContextId } from '@context-hub/domain/context/types.ts'

import type { PublishedSummary } from '../ports/ContextStore.ts'
import { toUserId, type Viewer } from '../viewer.ts'
import { checkLinkedContexts, resolveLinkedContexts } from './linkedContexts.ts'

const VIEWER: Viewer = { userId: toUserId('brice') }

function summary(id: string, version = 1): PublishedSummary {
  return {
    id: toContextId(id),
    slug: `slug/${id}`,
    title: `Titre ${id}`,
    description: '',
    scope: { kind: 'team', team: 'allovoisins' },
    version,
    tokenEstimate: 10,
    exposeAsPrompt: false,
  }
}

/** Store factice : ne connaît que `published`, et note chaque lecture. */
function lookup(...published: PublishedSummary[]) {
  const calls: (readonly string[])[] = []
  return {
    calls,
    findPublishedByIds: (_viewer: Viewer, ids: readonly string[]) => {
      calls.push(ids)
      return Promise.resolve(published.filter(({ id }) => ids.includes(id)))
    },
  }
}

describe('checkLinkedContexts', () => {
  it('rend les identifiants sans doublon, dans l’ordre demandé, en une seule lecture ciblée', async () => {
    const store = lookup(summary('a'), summary('b'))
    expect(await checkLinkedContexts(store, VIEWER, ['b', 'a', 'b'])).toEqual(['b', 'a'])
    expect(store.calls).toEqual([['b', 'a']])
  })

  it('null si un identifiant n’est pas publié et visible', async () => {
    expect(await checkLinkedContexts(lookup(summary('a')), VIEWER, ['a', 'x'])).toBeNull()
  })

  it('liste vide : aucune lecture', async () => {
    const store = lookup()
    expect(await checkLinkedContexts(store, VIEWER, [])).toEqual([])
    expect(store.calls).toEqual([])
  })
})

describe('resolveLinkedContexts', () => {
  it('ordre enregistré, version publiée courante ; un contexte disparu est omis', async () => {
    const store = lookup(summary('a', 3), summary('b'))
    expect(await resolveLinkedContexts(store, VIEWER, ['b', 'gone', 'a'])).toEqual([
      { id: 'b', slug: 'slug/b', title: 'Titre b', version: 1 },
      { id: 'a', slug: 'slug/a', title: 'Titre a', version: 3 },
    ])
  })

  it('liste vide : aucune lecture', async () => {
    const store = lookup()
    expect(await resolveLinkedContexts(store, VIEWER, [])).toEqual([])
    expect(store.calls).toEqual([])
  })
})
