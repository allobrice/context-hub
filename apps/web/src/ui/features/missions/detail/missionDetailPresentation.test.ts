import { describe, expect, it } from 'vitest'

import { MISSION_FIXTURES, type MissionFixture } from '@context-hub/domain/fixtures/missions.ts'
import type { MissionEvent } from '@context-hub/domain/missions/types.ts'

import {
  codeFileStates,
  deliverableLabel,
  freshnessWarning,
  historyItems,
  originPhrase,
  userNameOf,
} from './missionDetailPresentation.ts'
import { codeRefState } from '../shared/missionPresentation.ts'

function fixture(slug: string): MissionFixture {
  const found = MISSION_FIXTURES.find(({ mission }) => mission.slug === slug)
  if (found === undefined) throw new Error(`fixture absente : ${slug}`)
  return found
}

function labels(slug: string): string[] {
  const { mission, events } = fixture(slug)
  return historyItems(mission, events).map((item) => item.label)
}

describe('historyItems', () => {
  it('« Modifier » : « Modifiée par Brice · champs changés »', () => {
    const { mission, events } = fixture('perf-lcp-carrousel')
    const edited: MissionEvent = {
      missionId: mission.id,
      missionSlug: mission.slug,
      missionTitle: mission.title,
      at: mission.updatedAt,
      actor: { userId: 'brice' },
      type: 'edited',
      detail: 'prompt, priorité',
    }
    expect(historyItems(mission, [...events, edited])[0]?.label).toBe(
      'Modifiée par Brice · prompt, priorité',
    )
  })

  it('du plus récent au plus ancien, avec l’origine en minuscules', () => {
    expect(labels('perf-lcp-carrousel')).toEqual([
      'Validée par Brice',
      'Créée par perf-1 depuis l’audit perf',
    ])
  })

  it('fusionne le contrôle de fraîcheur qui suit une prise par la même session', () => {
    expect(labels('perf-precharger-polices')[0]).toBe('Prise par web-2 · code vérifié à jour')
    expect(labels('perf-decouper-chunk-vendor').slice(0, 2)).toEqual([
      'Libérée par web-2',
      'Prise par web-2 · 2 fichiers modifiés',
    ])
  })

  it('termine avec le premier livrable, abandon et réouverture par un humain', () => {
    expect(labels('perf-images-avif')[0]).toBe('Terminée par web-2 · PR !4812')
    expect(labels('perf-prefetch-liens')[0]).toBe('Abandonnée par Brice')

    const { mission, events } = fixture('perf-prefetch-liens')
    const reopened: MissionEvent = {
      missionId: mission.id,
      missionSlug: mission.slug,
      missionTitle: mission.title,
      at: '2026-11-23T10:00:00.000Z',
      actor: { userId: 'brice' },
      type: 'reopened',
      detail: null,
    }
    expect(historyItems(mission, [...events, reopened])[0]?.label).toBe('Rouverte par Brice')
  })

  it('un contrôle de fraîcheur isolé reste une ligne', () => {
    const { mission, events } = fixture('perf-precharger-polices')
    const [created, , taken, freshness] = events
    if (created === undefined || taken === undefined || freshness === undefined) {
      throw new Error('événements attendus')
    }
    const later = {
      ...freshness,
      at: '2026-11-23T10:10:00.000Z',
      detail: '1 fichier(s) modifié(s)',
    }
    expect(historyItems(mission, [created, taken, freshness, later])[0]?.label).toBe(
      'Code contrôlé par web-2 · 1 fichier modifié',
    )
  })
})

describe('libellés', () => {
  it('originPhrase : élision devant une voyelle, guillemets sinon', () => {
    expect(originPhrase('Audit perf · page d’accueil Nuxt')).toBe('l’audit perf')
    expect(originPhrase('Revue de code')).toBe('« Revue de code »')
    expect(originPhrase('')).toBe('')
  })

  it('deliverableLabel', () => {
    expect(deliverableLabel({ kind: 'pr', ref: '!4812' })).toBe('PR !4812')
    expect(deliverableLabel({ kind: 'commit', ref: 'abc1234' })).toBe('commit abc1234')
    expect(deliverableLabel({ kind: 'url', ref: 'https://example.test' })).toBe(
      'https://example.test',
    )
  })

  it('userNameOf : nom d’une session connue, sinon identifiant capitalisé', () => {
    const { mission, events } = fixture('perf-precharger-polices')
    expect(userNameOf('camille', mission, events)).toBe('Camille')
    expect(userNameOf('brice', mission, events)).toBe('Brice')
    expect(userNameOf('lea', mission, events)).toBe('Lea')
  })
})

describe('code d’origine', () => {
  it('chaque fichier modifié ou inchangé selon le dernier contrôle, et le bandeau N des M', () => {
    const { mission } = fixture('perf-decouper-chunk-vendor')
    expect(codeFileStates(mission)).toEqual([
      { path: 'nuxt.config.ts', changed: false },
      { path: 'app/utils/dates.ts', changed: true },
      { path: 'app/utils/collections.ts', changed: true },
    ])
    expect(freshnessWarning(mission)).toMatchObject({ changed: 2, total: 3 })
  })

  it('file et détail comptent les mêmes fichiers : un chemin hors mission est ignoré', () => {
    const { mission } = fixture('perf-decouper-chunk-vendor')
    if (mission.freshness === null) throw new Error('contrôle de fraîcheur attendu')
    const injected = {
      ...mission,
      freshness: {
        ...mission.freshness,
        changedFiles: [...mission.freshness.changedFiles, 'hors/mission.ts', '../../etc/passwd'],
      },
    }
    expect(codeRefState(injected).label).toBe('2 fichiers modifiés')
    expect(freshnessWarning(injected)).toMatchObject({ changed: 2, total: 3 })
    expect(codeFileStates(injected).map((file) => file.path)).toEqual(mission.codeRef.files)

    const outsideOnly = {
      ...mission,
      freshness: { ...mission.freshness, changedFiles: ['hors/mission.ts'] },
    }
    expect(codeRefState(outsideOnly).tone).toBe('ok')
    expect(freshnessWarning(outsideOnly)).toBeNull()
  })

  it('sans contrôle ou sans changement : pas de bandeau', () => {
    expect(freshnessWarning(fixture('perf-lcp-carrousel').mission)).toBeNull()
    expect(
      codeFileStates(fixture('perf-lcp-carrousel').mission).every((file) => !file.changed),
    ).toBe(true)
  })
})
