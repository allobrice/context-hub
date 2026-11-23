import { describe, expect, it } from 'vitest'

import { editorReducer, isDirty, newEditorState, type EditorContext } from './editorForm.ts'

const context: EditorContext = {
  slugEditable: true,
  collectionName: (id) => (id === 'nuxt' ? 'Nuxt' : null),
  currentUser: 'Brice',
}
const reduce = editorReducer(context)

describe('editorReducer — création (maquette 14)', () => {
  it('démarre en portée Personnel, sans modification', () => {
    const state = newEditorState('Brice')
    expect(state.values.scope).toEqual({ kind: 'personal', owner: 'brice' })
    expect(isDirty(state)).toBe(false)
  })

  it('génère l’identifiant depuis le titre et la collection, jusqu’à ce qu’on le retouche', () => {
    let state = reduce(newEditorState('Brice'), { type: 'title', title: 'Data fetching' })
    expect(state.values.slug).toBe('data-fetching')
    state = reduce(state, { type: 'collection', collectionId: 'nuxt' })
    expect(state.values.slug).toBe('nuxt/data-fetching')
    state = reduce(state, { type: 'slug', slug: 'nuxt/fetch' })
    state = reduce(state, { type: 'title', title: 'Autre titre' })
    expect(state.values.slug).toBe('nuxt/fetch')
    expect(isDirty(state)).toBe(true)
  })

  it('ne régénère pas un identifiant figé', () => {
    const frozen = editorReducer({ ...context, slugEditable: false })
    const state = frozen(
      { ...newEditorState('Brice'), values: { ...newEditorState('Brice').values, slug: 'nuxt/x' } },
      {
        type: 'title',
        title: 'Nouveau titre',
      },
    )
    expect(state.values.slug).toBe('nuxt/x')
  })

  it('préremplit le titre (« Créer « pinia ssr » » depuis la Bibliothèque)', () => {
    expect(newEditorState('Brice', 'pinia ssr').values).toMatchObject({
      title: 'pinia ssr',
      slug: 'pinia-ssr',
    })
  })
})

describe('editorReducer — portée et tags', () => {
  it('Projet fait apparaître un repo, conservé si l’on change de portée puis revient', () => {
    let state = reduce(newEditorState('Brice'), { type: 'scope', kind: 'project' })
    state = reduce(state, { type: 'repo', repo: 'allovoisins/front' })
    state = reduce(state, { type: 'scope', kind: 'team' })
    expect(state.values.scope).toEqual({ kind: 'team', team: 'allovoisins' })
    state = reduce(state, { type: 'scope', kind: 'project' })
    expect(state.values.scope).toEqual({ kind: 'project', repo: 'allovoisins/front' })
  })

  it('ajoute des tags normalisés, sans doublon, et les retire', () => {
    let state = reduce(newEditorState('Brice'), { type: 'add-tag', tag: ' Nuxt ' })
    state = reduce(state, { type: 'add-tag', tag: 'nuxt' })
    expect(state.values.tags).toEqual(['nuxt'])
    expect(reduce(state, { type: 'remove-tag', tag: 'nuxt' }).values.tags).toEqual([])
  })
})

describe('editorReducer — enregistrement et conflit', () => {
  it('« saved » remet l’indicateur de modification à zéro', () => {
    const edited = reduce(newEditorState('Brice'), { type: 'content', value: '# Titre' })
    expect(isDirty(edited)).toBe(true)
    expect(
      isDirty(reduce(edited, { type: 'saved', values: edited.values, baseVersion: null })),
    ).toBe(false)
  })

  it('« rebase » repart du contenu publié et de sa version', () => {
    const state = reduce(newEditorState('Brice'), { type: 'rebase', content: 'v5', baseVersion: 5 })
    expect(state.values.content).toBe('v5')
    expect(state.baseVersion).toBe(5)
  })
})
