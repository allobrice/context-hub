import { describe, expect, it } from 'vitest'

import { lineDiff, hasChanges } from './diff.ts'
import {
  draftRejections,
  isValidFalsePositiveReason,
  publishRejections,
  remainingFindings,
  reviewPublication,
  shortTitle,
  type ContextDraftInput,
} from './editing.ts'
import type { ScanFinding } from './scan.ts'

describe('remainingFindings', () => {
  it('retire les faux positifs déclarés', () => {
    const secret: ScanFinding = {
      kind: 'secret',
      line: 15,
      pattern: 'sk_live_',
      label: 'clé d’API',
    }
    const other: ScanFinding = { kind: 'suspicious-instruction', line: 3, excerpt: 'x' }
    expect(
      remainingFindings(
        [secret, other],
        [{ findingKey: 'secret:15:sk_live_', reason: 'clé de test' }],
      ),
    ).toEqual([other])
  })

  it('exige une justification', () => {
    expect(isValidFalsePositiveReason('  ')).toBe(false)
    expect(isValidFalsePositiveReason('clé factice de démo')).toBe(true)
  })
})

describe('shortTitle', () => {
  it('coupe au tiret long', () => {
    expect(shortTitle('Conventions Nuxt 4 — composables & auto-imports')).toBe('Conventions Nuxt 4')
    expect(shortTitle('Patterns de stores Pinia')).toBe('Patterns de stores Pinia')
  })
})

describe('lineDiff', () => {
  it('marque les lignes ajoutées, retirées et communes', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ])
  })

  it('détecte l’absence de changement', () => {
    expect(hasChanges(lineDiff('a\nb', 'a\nb'))).toBe(false)
    expect(hasChanges(lineDiff('', 'x'))).toBe(true)
  })
})

const input: ContextDraftInput = {
  title: 'Conventions Nuxt 4',
  slug: 'nuxt/conventions-nuxt-4',
  description: 'Structure app/',
  collectionId: 'nuxt',
  tags: ['nuxt'],
  scope: { kind: 'team', team: 'allovoisins' },
  content: '# Conventions',
  versionNote: 'Ajout section routes server/',
}
const free = { takenSlugs: new Set<string>(), frozenSlug: null, personalScopeAllowed: true }

describe('draftRejections', () => {
  it('accepte un brouillon valide', () => {
    expect(draftRejections(input, free)).toEqual([])
  })

  it('refuse un slug invalide, déjà pris ou modifié après la v1', () => {
    expect(draftRejections({ ...input, slug: 'Nuxt//x' }, free)).toEqual(['slug-invalid'])
    expect(draftRejections(input, { ...free, takenSlugs: new Set([input.slug]) })).toEqual([
      'slug-taken',
    ])
    expect(
      draftRejections({ ...input, slug: 'nuxt/autre' }, { ...free, frozenSlug: input.slug }),
    ).toEqual(['slug-frozen'])
  })

  it('exige un repo pour la portée Projet', () => {
    expect(draftRejections({ ...input, scope: { kind: 'project', repo: ' ' } }, free)).toEqual([
      'repo-required',
    ])
  })
})

describe('publishRejections (contrôle serveur)', () => {
  const withSecret = { ...input, content: 'NUXT_API_KEY=sk_live_51HxDEMOonly3kQ' }

  it('rescanne le contenu : un secret bloque la publication', () => {
    expect(publishRejections(withSecret, [], free)).toEqual(['secret-detected'])
  })

  it('accepte un faux positif justifié', () => {
    expect(
      publishRejections(
        withSecret,
        [{ findingKey: 'secret:1:sk_live_', reason: 'clé de démo' }],
        free,
      ),
    ).toEqual([])
  })

  it('cumule les raisons sans doublon', () => {
    expect(publishRejections({ ...withSecret, title: '', versionNote: '' }, [], free)).toEqual([
      'secret-detected',
      'title-empty',
      'version-note-empty',
    ])
  })
})

describe('règles de sécurité de la publication (audit phase 6)', () => {
  it('refuse la portée personnelle à qui n’est pas l’auteur', () => {
    const personal = { ...input, scope: { kind: 'personal', owner: 'camille' } as const }
    expect(draftRejections(personal, { ...free, personalScopeAllowed: false })).toContain(
      'personal-scope-forbidden',
    )
    expect(draftRejections(personal, free)).not.toContain('personal-scope-forbidden')
  })

  it('scanne aussi le titre, la description, la note et les tags', () => {
    for (const field of ['title', 'description', 'versionNote'] as const) {
      const withSecret = { ...input, [field]: 'token ghp_abcdefghijklmnopqrstuvwxyz0123' }
      expect(reviewPublication(withSecret, [], free).reasons, field).toContain('secret-in-metadata')
    }
    expect(
      reviewPublication({ ...input, tags: ['sk_live_51HxDEMOonly3kQ'] }, [], free).reasons,
    ).toContain('secret-in-metadata')
  })
})
