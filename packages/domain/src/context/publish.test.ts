import { describe, expect, it } from 'vitest'

import { canPublish, publishBlockers, type PublishCandidate } from './publish.ts'
import type { ScanFinding } from './scan.ts'

const ready: PublishCandidate = {
  title: 'Conventions Nuxt 4',
  description: 'ok',
  versionNote: 'Ajout section routes server/',
}
const secret: ScanFinding = { kind: 'secret', line: 15, pattern: 'sk_live_', label: 'clé d’API' }

describe('canPublish', () => {
  it('autorise un brouillon complet sans secret', () => {
    expect(canPublish(ready, [])).toBe(true)
  })

  it('reste vrai avec une simple instruction suspecte (signalée, non bloquante)', () => {
    expect(canPublish(ready, [{ kind: 'suspicious-instruction', line: 1, excerpt: 'x' }])).toBe(
      true,
    )
  })

  it.each([
    ['un secret est détecté', ready, [secret], 'secret-detected'],
    ['le titre est vide', { ...ready, title: '   ' }, [], 'title-empty'],
    ['la note de version est vide', { ...ready, versionNote: '' }, [], 'version-note-empty'],
    [
      'la description dépasse 160 caractères',
      { ...ready, description: 'x'.repeat(161) },
      [],
      'description-too-long',
    ],
  ] as const)('est faux si %s', (_, candidate, findings, blocker) => {
    expect(canPublish(candidate, findings)).toBe(false)
    expect(publishBlockers(candidate, findings)).toEqual([blocker])
  })

  it('liste toutes les raisons dans un ordre stable', () => {
    expect(publishBlockers({ title: '', description: '', versionNote: '' }, [secret])).toEqual([
      'secret-detected',
      'title-empty',
      'version-note-empty',
    ])
  })
})

describe('publishBlockers : modèle réutilisable (prompt MCP, SPEC §8.5)', () => {
  const suspicious: ScanFinding = { kind: 'suspicious-instruction', line: 3, excerpt: 'Ignore…' }

  it('bloque une instruction suspecte non justifiée quand le contexte est exposé comme prompt', () => {
    expect(publishBlockers({ ...ready, exposeAsPrompt: true }, [suspicious])).toEqual([
      'suspicious-prompt',
    ])
  })

  it('ne bloque pas sans exposition, ni une fois l’instruction justifiée (absente des findings)', () => {
    expect(publishBlockers(ready, [suspicious])).toEqual([])
    expect(publishBlockers({ ...ready, exposeAsPrompt: true }, [])).toEqual([])
  })
})
