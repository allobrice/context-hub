import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MISSION_QUERY,
  facetValues,
  nextCommand,
  parseMissionParams,
  toggleTag,
  writeMissionParams,
} from './missionParams.ts'

describe('parseMissionParams', () => {
  it('sans paramètre : file « À traiter », sans filtre', () => {
    expect(parseMissionParams(new URLSearchParams())).toEqual(DEFAULT_MISSION_QUERY)
  })

  it('lit filtre, tags, repo et lot', () => {
    const query = parseMissionParams(
      new URLSearchParams(
        'filter=archived&tags=perf,lcp&repo=allovoisins/front&batch=audit-perf-home-2026-11',
      ),
    )
    expect(query).toEqual({
      filter: 'archived',
      tags: ['perf', 'lcp'],
      repo: 'allovoisins/front',
      batchId: 'audit-perf-home-2026-11',
    })
  })

  it('ignore un filtre inconnu, les tags vides ou en double et les valeurs blanches', () => {
    const query = parseMissionParams(new URLSearchParams('filter=bogus&tags=perf,,perf, &repo=%20'))
    expect(query).toEqual({ ...DEFAULT_MISSION_QUERY, tags: ['perf'] })
  })
})

describe('writeMissionParams', () => {
  it('omet les valeurs par défaut', () => {
    expect(writeMissionParams(DEFAULT_MISSION_QUERY).toString()).toBe('')
  })

  it('écrit chaque filtre actif', () => {
    const params = writeMissionParams({
      filter: 'ready',
      tags: ['perf', 'lcp'],
      repo: 'allovoisins/front',
      batchId: 'lot-1',
    })
    expect(Object.fromEntries(params)).toEqual({
      filter: 'ready',
      tags: 'perf,lcp',
      repo: 'allovoisins/front',
      batch: 'lot-1',
    })
  })

  it('conserve les paramètres inconnus et retire les filtres levés', () => {
    const base = new URLSearchParams('mock=loading&filter=all&tags=perf&repo=r')
    const params = writeMissionParams(DEFAULT_MISSION_QUERY, base)
    expect(params.toString()).toBe('mock=loading')
    expect(base.toString()).toBe('mock=loading&filter=all&tags=perf&repo=r')
  })

  it('aller-retour sans perte', () => {
    const query = { filter: 'to_validate', tags: ['perf'], repo: null, batchId: 'b' } as const
    expect(parseMissionParams(writeMissionParams(query))).toEqual(query)
  })
})

describe('toggleTag', () => {
  it('ajoute un tag absent, retire un tag présent', () => {
    expect(toggleTag(['perf'], 'lcp')).toEqual(['perf', 'lcp'])
    expect(toggleTag(['perf', 'lcp'], 'perf')).toEqual(['lcp'])
  })
})

describe('nextCommand', () => {
  it('reprend les tags filtrés, ou la commande seule', () => {
    expect(nextCommand(['perf'])).toBe('/context-hub:next perf')
    expect(nextCommand(['perf', 'lcp'])).toBe('/context-hub:next perf lcp')
    expect(nextCommand([])).toBe('/context-hub:next')
  })
})

describe('facetValues', () => {
  it('fusionne valeurs affichées et sélectionnées, triées et sans doublon', () => {
    expect(facetValues(['perf', 'lcp', 'perf'], ['bundle', 'lcp'])).toEqual([
      'bundle',
      'lcp',
      'perf',
    ])
  })
})
