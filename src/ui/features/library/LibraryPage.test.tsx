import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createTestServices, renderApp } from '../../../test/renderApp.tsx'

const TITLE_NUXT = 'Conventions Nuxt 4 — composables & auto-imports'

async function findTable() {
  return screen.findByRole('table', { name: 'Contextes' })
}

describe('Bibliothèque — les 4 états (SPEC §5)', () => {
  it('chargement : squelette, aria-busy et « Chargement… » (maquette 05)', async () => {
    renderApp('/', { mode: 'loading' })
    expect(await screen.findByText('Chargement…')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Résultats' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('table', { name: 'Contextes' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('vide : explication et CTA, sans barre de filtres (maquette 04)', async () => {
    renderApp('/', { mode: 'empty' })
    expect(
      await screen.findByRole('heading', { name: 'Aucun contexte pour l’instant' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Créer un contexte' })).toHaveAttribute(
      'href',
      '/contexts/new',
    )
    expect(screen.getByRole('link', { name: 'Connecter Claude Code' })).toHaveAttribute(
      'href',
      '/mcp',
    )
    expect(screen.getByText('Aucun contexte')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Trier' })).not.toBeInTheDocument()
  })

  it('erreur : message, code technique en mono et Réessayer (maquette 06)', async () => {
    const services = createTestServices('error')
    const search = vi.spyOn(services.contexts, 'search')
    renderApp('/', { services })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Impossible de charger les contextes')
    expect(within(alert).getByText('SQLITE_BUSY · database is locked · req 7f3a91').tagName).toBe(
      'CODE',
    )
    expect(screen.getByText('Données indisponibles')).toBeInTheDocument()

    expect(search).toHaveBeenCalledOnce()
    await userEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }))
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('aucun résultat : rappelle la requête et propose les sorties (maquette 07)', async () => {
    const view = renderApp('/?q=pinia+ssr&scope=team')
    expect(
      await screen.findByRole('heading', { name: 'Aucun contexte ne correspond à « pinia ssr »' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 filtre est actif\./)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 résultat')
    expect(screen.getByRole('link', { name: 'Créer « pinia ssr »' })).toHaveAttribute(
      'href',
      '/contexts/new?title=pinia+ssr',
    )

    const results = screen.getByRole('region', { name: 'Résultats' })
    await userEvent.click(within(results).getByRole('button', { name: 'Retirer le filtre Portée' }))
    expect(view.location().search).toBe('?q=pinia+ssr')

    await userEvent.click(await screen.findByRole('button', { name: 'Effacer la recherche' }))
    expect(await findTable()).toBeInTheDocument()
    expect(view.location().search).toBe('')
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans les contextes' })).toHaveValue('')
  })
})

describe('Bibliothèque — résultats', () => {
  it('affiche les compteurs, 25 lignes par page et des lignes qui mènent au Détail (maquette 01)', async () => {
    renderApp('/')
    const table = await findTable()
    expect(
      screen.getByText('42 contextes · 31 publiés · 8 brouillons · 3 archivés'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('42 résultats')
    expect(within(table).getAllByRole('row')).toHaveLength(26)
    expect(within(table).getByRole('link', { name: TITLE_NUXT })).toHaveAttribute(
      'href',
      '/contexts/ctx-nuxt-conventions',
    )
    expect(within(table).getByRole('columnheader', { name: 'Mis à jour ↓' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(screen.getByText('1–25 sur 42', { exact: false })).toBeInTheDocument()
  })

  it('pagine et synchronise la page dans l’URL', async () => {
    const view = renderApp('/')
    await findTable()
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(await screen.findByText('26–42 sur 42', { exact: false })).toBeInTheDocument()
    expect(view.location().search).toBe('?page=2')
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
  })

  it('recherche debouncée, synchronisée dans l’URL', async () => {
    const view = renderApp('/')
    await findTable()
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Rechercher dans les contextes' }),
      'pinia',
    )
    await waitFor(() => {
      expect(view.location().search).toBe('?q=pinia')
    })
    // Debounce (250 ms) + rendu différé : marge explicite pour une suite exécutée en parallèle.
    expect(await screen.findByText('4 résultats', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Patterns de stores Pinia' })).toBeInTheDocument()
  })

  it('⌘K / Ctrl+K place le focus dans la recherche', async () => {
    renderApp('/')
    await findTable()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans les contextes' })).toHaveFocus()
  })

  it('filtre par statut via le menu, avec un chip retirable', async () => {
    const view = renderApp('/')
    await findTable()
    await userEvent.click(screen.getByRole('button', { name: 'Statut' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Brouillon' }))
    expect(await screen.findByText('8 résultats')).toBeInTheDocument()
    expect(view.location().search).toBe('?status=draft')
    expect(screen.getByRole('button', { name: 'Statut : Brouillon' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre Statut' }))
    expect(await screen.findByText('42 résultats')).toBeInTheDocument()
  })

  it('bascule en vue cartes (maquette 02) et la garde dans l’URL', async () => {
    const view = renderApp('/')
    await findTable()
    await userEvent.click(screen.getByRole('radio', { name: 'Cartes' }))
    expect(await screen.findByRole('list', { name: 'Contextes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: TITLE_NUXT })).toBeInTheDocument()
    expect(view.location().search).toBe('?view=cards')
  })

  it('trie par titre', async () => {
    const view = renderApp('/')
    await findTable()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Trier' }), 'Titre A → Z')
    expect(view.location().search).toBe('?sort=title-asc')
    const table = await findTable()
    await waitFor(() => {
      expect(within(table).getAllByRole('link')[0]).toHaveTextContent(
        'Ancienne configuration de build',
      )
    })
  })
})

describe('Sidebar', () => {
  it('compte les contextes et filtre par collection ou portée', async () => {
    const view = renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })
    expect(await within(nav).findByRole('link', { name: /Bibliothèque\s*42/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent.click(within(nav).getByRole('link', { name: /Nuxt\s*9/ }))
    expect(view.location().search).toBe('?collection=nuxt')
    expect(await screen.findByText('9 résultats')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collection : Nuxt' })).toBeInTheDocument()
  })

  it('garde ses compteurs pendant le chargement de la liste (maquette 05)', async () => {
    renderApp('/', { mode: 'loading' })
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })
    expect(await within(nav).findByRole('link', { name: /Équipe\s*25/ })).toBeInTheDocument()
  })
})
