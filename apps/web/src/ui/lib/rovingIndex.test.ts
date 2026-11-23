import { describe, expect, it } from 'vitest'

import { rovingIndex } from './rovingIndex.ts'

describe('rovingIndex', () => {
  it('avance et recule en boucle selon l’orientation', () => {
    expect(rovingIndex('ArrowRight', 0, 3, 'horizontal')).toBe(1)
    expect(rovingIndex('ArrowRight', 2, 3, 'horizontal')).toBe(0)
    expect(rovingIndex('ArrowLeft', 0, 3, 'horizontal')).toBe(2)
    expect(rovingIndex('ArrowDown', 1, 3, 'vertical')).toBe(2)
    expect(rovingIndex('ArrowUp', 1, 3, 'both')).toBe(0)
  })

  it('ignore les flèches hors orientation et les autres touches', () => {
    expect(rovingIndex('ArrowDown', 0, 3, 'horizontal')).toBeNull()
    expect(rovingIndex('Enter', 0, 3, 'both')).toBeNull()
  })

  it('gère Début, Fin et une liste vide', () => {
    expect(rovingIndex('Home', 2, 3, 'both')).toBe(0)
    expect(rovingIndex('End', 0, 3, 'both')).toBe(2)
    expect(rovingIndex('End', 0, 0, 'both')).toBeNull()
  })

  it('part du début quand aucun élément n’a le focus (index -1)', () => {
    expect(rovingIndex('ArrowDown', -1, 3, 'vertical')).toBe(0)
  })
})
