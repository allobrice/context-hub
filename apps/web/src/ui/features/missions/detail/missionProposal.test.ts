import { describe, expect, it } from 'vitest'

import { MISSION_FIXTURES } from '@context-hub/domain/fixtures/missions.ts'
import type { DoneMission } from '@context-hub/domain/missions/types.ts'

import { missionProposal, PROPOSAL_DESCRIPTION_MAX_LENGTH } from './missionProposal.ts'

function doneMission(): DoneMission {
  const mission = MISSION_FIXTURES.find(({ mission: item }) => item.status === 'done')?.mission
  if (mission?.status !== 'done') throw new Error('mission terminée attendue')
  return mission
}

describe('missionProposal', () => {
  it('titre, description et contenu construits depuis le résultat', () => {
    const proposal = missionProposal(doneMission())
    expect(proposal.title).toBe('Servir les visuels de la home en AVIF')
    expect(proposal.description).toBe('Les visuels de la home pèsent 1,9 Mo en JPEG')
    expect(proposal.content).toBe(
      [
        '# Servir les visuels de la home en AVIF',
        '',
        'Visuels servis en AVIF par @nuxt/image, avec des srcset adaptés au viewport. Poids des images de la home divisé par 4.',
        '',
        '## Mesures',
        '',
        '| Mesure | Avant | Après |',
        '| --- | --- | --- |',
        '| Poids des images | 1,9 Mo | 0,46 Mo |',
        '| LCP mobile | 3,8 s | 3,4 s |',
        '',
        '## Livrables',
        '',
        '- PR !4812',
        '',
        '> Issu de la mission perf-images-avif. À relire avant publication.',
      ].join('\n'),
    )
  })

  it('tronque la description à 160 caractères et protège les cellules du tableau', () => {
    const mission = doneMission()
    const proposal = missionProposal({
      ...mission,
      summary: 'x'.repeat(300),
      result: {
        ...mission.result,
        metrics: [{ name: 'a | b', before: '1\n2', after: '3' }],
        deliverables: [],
      },
    })
    expect(proposal.description).toHaveLength(PROPOSAL_DESCRIPTION_MAX_LENGTH)
    expect(proposal.description.endsWith('…')).toBe(true)
    expect(proposal.content).toContain('| a \\| b | 1 2 | 3 |')
    expect(proposal.content).not.toContain('## Livrables')
  })

  it('sans mesure ni livrable : résumé et origine seulement', () => {
    const mission = doneMission()
    const proposal = missionProposal({
      ...mission,
      result: { ...mission.result, metrics: [], deliverables: [] },
    })
    expect(proposal.content).not.toContain('## Mesures')
    expect(proposal.content).toContain('Issu de la mission perf-images-avif')
  })
})
