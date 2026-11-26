import { describe, expect, it } from 'vitest'

import { DEMO_NOW } from '@context-hub/domain/fixtures/now.ts'
import { MISSION_FIXTURES } from '@context-hub/domain/fixtures/missions.ts'
import { toMissionSummary, type Mission } from '@context-hub/domain/missions/types.ts'

import {
  batchSegments,
  codeRefState,
  deadlineLabel,
  lifecycleSteps,
  statusSubline,
} from './missionPresentation.ts'

const NOW = new Date(DEMO_NOW)

function fixture(slug: string) {
  const found = MISSION_FIXTURES.find(({ mission }) => mission.slug === slug)
  if (found === undefined) throw new Error(slug)
  return found
}

function summary(slug: string) {
  return toMissionSummary(fixture(slug).mission)
}

describe('file (maquette 31)', () => {
  it.each([
    ['perf-lcp-carrousel', 'en attente d’une session'],
    ['perf-precharger-polices', 'web-2 · réservée 18 min'],
    ['perf-decouper-chunk-vendor', 'à revérifier avant de prendre'],
    ['perf-hydratation-footer', 'portée équipe : validation requise'],
  ])('sous-ligne de %s : %s', (slug, expected) => {
    expect(statusSubline(summary(slug), NOW)).toBe(expected)
  })

  it('échéance : « expire dans 13 j » tant qu’ouverte, date d’archivage ensuite', () => {
    expect(deadlineLabel(summary('perf-lcp-carrousel'), NOW)).toBe('expire dans 13 j')
    expect(deadlineLabel(summary('perf-images-avif'), NOW)).toMatch(/^archivée le 23 nov\.$/)
  })

  it('code d’origine : à jour avec le commit, ou N fichiers modifiés', () => {
    expect(codeRefState(summary('perf-lcp-carrousel'))).toEqual({
      tone: 'ok',
      label: 'À jour (a41c9e2)',
    })
    expect(codeRefState(summary('perf-decouper-chunk-vendor'))).toEqual({
      tone: 'warn',
      label: '2 fichiers modifiés',
    })
  })

  it('bloc « Origine » : segments dans l’ordre des maquettes, au pluriel', () => {
    expect(
      batchSegments({ draft: 1, ready: 2, in_progress: 1, done: 1, dropped: 1, expired: 0 }).map(
        (segment) => segment.label,
      ),
    ).toEqual(['1 terminée', '1 en cours', '2 prêtes', '1 à valider', '1 abandonnée'])
  })
})

describe('frise du cycle de vie (maquettes 34–38)', () => {
  function steps(mission: Mission, slug = mission.slug) {
    return lifecycleSteps(mission, fixture(slug).events, NOW, () => 'Brice').map((step) => [
      step.label,
      step.state,
      step.detail,
    ])
  }

  it('à valider : étape 1 courante', () => {
    const { mission } = fixture('perf-hydratation-footer')
    expect(steps(mission)).toEqual([
      ['À valider', 'current', 'écrite par perf-1'],
      ['Prête', 'upcoming', 'après validation'],
      ['En cours', 'upcoming', 'prise par 1 session'],
      ['Terminée', 'upcoming', 'puis archivée'],
    ])
  })

  it('en cours : deux étapes cochées, la troisième en accent avec la session', () => {
    const { mission } = fixture('perf-precharger-polices')
    expect(steps(mission)).toEqual([
      ['À valider', 'done', 'écrite par perf-1'],
      ['Prête', 'done', 'validée par Brice'],
      ['En cours', 'current', 'web-2 · 18 min'],
      ['Terminée', 'upcoming', 'puis archivée'],
    ])
  })

  it('terminée : étapes passées cochées, « Terminée » en accent', () => {
    const { mission } = fixture('perf-images-avif')
    expect(steps(mission).map(([, state]) => state)).toEqual(['done', 'done', 'done', 'current'])
    expect(steps(mission).at(-1)?.[2]).toBe('résultat enregistré')
  })

  it('terminée : « En cours » montre la durée prise → fin, quelle que soit l’horloge', () => {
    const { mission, events } = fixture('perf-images-avif')
    const takenDetail = (now: Date) =>
      lifecycleSteps(mission, events, now, () => 'Brice').find((step) => step.label === 'En cours')
        ?.detail
    // Prise il y a 5 h, terminée il y a 3 h : 2 h de traitement (et non 5 h jusqu'à maintenant).
    expect(takenDetail(NOW)).toBe('web-2 · 2 h')
    expect(takenDetail(new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000))).toBe('web-2 · 2 h')
  })
})
