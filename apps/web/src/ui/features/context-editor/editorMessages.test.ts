import { describe, expect, it } from 'vitest'

import { describeRejections, saveStatusLabel, type SaveStatusInput } from './editorMessages.ts'

const base: SaveStatusInput = {
  pending: false,
  conflict: false,
  isNew: false,
  dirty: false,
  savedLocally: false,
  draftSavedAt: null,
  now: new Date('2026-11-23T11:12:00+01:00'),
}

describe('saveStatusLabel (maquettes 12–15)', () => {
  it.each([
    [{ isNew: true }, 'Pas encore enregistré'],
    [{ conflict: true, dirty: true }, 'Non enregistré'],
    [{ dirty: true }, 'Non enregistré'],
    [{ dirty: true, savedLocally: true }, 'Modifications conservées localement'],
    [{ draftSavedAt: '2026-11-23T10:52:00+01:00' }, 'Brouillon enregistré il y a 20 min'],
    [{}, 'Aucune modification'],
    [{ pending: true, conflict: true }, 'Enregistrement…'],
  ] as const)('%o → %s', (patch, expected) => {
    expect(saveStatusLabel({ ...base, ...patch })).toBe(expected)
  })
})

describe('describeRejections', () => {
  it('liste les raisons dans l’ordre', () => {
    expect(describeRejections(['title-empty', 'repo-required'])).toBe(
      'titre requis · repo requis pour la portée Projet',
    )
  })
})
