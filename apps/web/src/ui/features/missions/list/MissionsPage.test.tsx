import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createTestServices, renderApp } from '../../../../test/renderApp.tsx'

async function rows() {
  const table = await screen.findByRole('table', { name: 'Missions' })
  return within(table).getAllByRole('row').slice(1)
}

function radio(name: RegExp) {
  return screen.getByRole('radio', { name })
}

describe('Missions : file (maquette 31)', () => {
  it('liste les missions à traiter par priorité, puis ancienneté', async () => {
    renderApp('/missions')
    const [lcp, fonts, vendor, footer, ...rest] = await rows()
    expect(rest).toHaveLength(0)

    expect(lcp).toHaveTextContent('P1')
    expect(lcp).toHaveTextContent('Lazy-load du carrousel de la home')
    expect(lcp).toHaveTextContent('LCP mobile 3,8 s : l’image du carrousel est l’élément LCP')
    expect(lcp).toHaveTextContent('perflcp')
    expect(lcp).toHaveTextContent('À jour (a41c9e2)')
    expect(lcp).toHaveTextContent('Prête')
    expect(lcp).toHaveTextContent('en attente d’une session')
    expect(lcp).toHaveTextContent('expire dans 13 j')

    expect(fonts).toHaveTextContent('Précharger TT Chocolates et passer en font-display: swap')
    expect(fonts).toHaveTextContent('En cours')
    expect(fonts).toHaveTextContent('web-2 · réservée 18 min')

    expect(vendor).toHaveTextContent('P2')
    expect(vendor).toHaveTextContent('Découper le chunk vendor (lodash, dayjs)')
    expect(vendor).toHaveTextContent('2 fichiers modifiés')
    expect(vendor).toHaveTextContent('à revérifier avant de prendre')

    expect(footer).toHaveTextContent('Hydratation différée du footer')
    expect(footer).toHaveTextContent('À valider')
    expect(footer).toHaveTextContent('portée équipe : validation requise')

    expect(screen.getByText('Tri : priorité, puis ancienneté')).toBeInTheDocument()
    expect(screen.getByText('/context-hub:next')).toBeInTheDocument()
  })

  it('affiche les compteurs de chaque filtre', async () => {
    renderApp('/missions')
    await rows()
    const counts = { 'À traiter': '4', 'À valider': '1', Prêtes: '2', Archivées: '2', Toutes: '6' }
    for (const [label, count] of Object.entries(counts)) {
      const option = radio(new RegExp(`^${label}`))
      expect(within(option).getByText(count)).toBeInTheDocument()
    }
    expect(radio(/^À traiter/)).toHaveAttribute('aria-checked', 'true')
  })

  it('changement de filtre : file précédente gardée (atténuée, aria-busy) jusqu’à la réponse', async () => {
    const services = createTestServices()
    const list = services.missions.list.bind(services.missions)
    const answer = vi.spyOn(services.missions, 'list')
    renderApp('/missions', { services })
    expect(await rows()).toHaveLength(4)

    let release: () => void = () => undefined
    answer.mockImplementationOnce(async (query) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return list(query)
    })
    await userEvent.click(radio(/^Archivées/))

    const table = screen.getByRole('table', { name: 'Missions' })
    const body = within(table).getAllByRole('rowgroup').at(-1)
    expect(body).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByLabelText('Chargement des missions')).not.toBeInTheDocument()
    expect(await rows()).toHaveLength(4)
    expect(within(radio(/^Archivées/)).getByText('2')).toBeInTheDocument()
    expect(within(radio(/^À traiter/)).getByText('4')).toBeInTheDocument()

    release()
    await waitFor(async () => {
      expect(await rows()).toHaveLength(2)
    })
    expect(within(table).getAllByRole('rowgroup').at(-1)).toHaveAttribute('aria-busy', 'false')
  })

  it('change de filtre dans l’URL en conservant les paramètres inconnus', async () => {
    const { location } = renderApp('/missions?mock=demo')
    await rows()
    await userEvent.click(radio(/^Archivées/))
    expect(new URLSearchParams(location().search).get('filter')).toBe('archived')
    expect(new URLSearchParams(location().search).get('mock')).toBe('demo')
    const archived = await screen.findByRole('link', {
      name: 'Servir les visuels de la home en AVIF',
    })
    expect(archived.closest('[role="row"]')).toHaveTextContent('Terminée')
    expect(await rows()).toHaveLength(2)

    await userEvent.click(radio(/^À traiter/))
    expect(location().search).toBe('?mock=demo')
  })

  it('filtre par tag : chip retirable, commande et compteurs mis à jour', async () => {
    const { location } = renderApp('/missions')
    await rows()
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }))
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'lcp' }))
    expect(new URLSearchParams(location().search).get('tags')).toBe('lcp')
    await waitFor(async () => {
      expect(await rows()).toHaveLength(1)
    })
    expect(screen.getByText('/context-hub:next lcp')).toBeInTheDocument()
    expect(within(radio(/^Toutes/)).getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tags : lcp/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retirer le filtre Tags' }))
    expect(location().search).toBe('')
    await waitFor(async () => {
      expect(await rows()).toHaveLength(4)
    })
  })

  it('filtre par repo', async () => {
    const { location } = renderApp('/missions')
    await rows()
    await userEvent.click(screen.getByRole('button', { name: 'Repo' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'allovoisins/front' }))
    expect(new URLSearchParams(location().search).get('repo')).toBe('allovoisins/front')
    expect(await screen.findByRole('button', { name: /Repo : allovoisins\/front/ })).toBeVisible()
    expect(await rows()).toHaveLength(4)
  })

  it('un repo sans mission : message, filtres toujours disponibles', async () => {
    renderApp('/missions?repo=allovoisins/back')
    expect(await screen.findByText('Aucune mission à traiter pour ces filtres.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retirer le filtre Repo' })).toBeInTheDocument()
  })

  it('la ligne mène au détail', async () => {
    const { location } = renderApp('/missions')
    await userEvent.click(
      await screen.findByRole('link', { name: 'Lazy-load du carrousel de la home' }),
    )
    await waitFor(() => {
      expect(location().pathname).toBe('/missions/perf-lcp-carrousel')
    })
  })
})

describe('Missions : bloc Origine', () => {
  it('absent sans filtre de lot', async () => {
    renderApp('/missions')
    await rows()
    expect(screen.queryByRole('region', { name: 'Origine des missions' })).not.toBeInTheDocument()
  })

  it('file filtrée par lot : libellé, session, repo @ commit, date et avancement', async () => {
    renderApp('/missions?batch=audit-perf-home-2026-11')
    const origin = await screen.findByRole('region', { name: 'Origine des missions' })
    expect(origin).toHaveTextContent('Audit perf · page d’accueil Nuxt')
    expect(origin).toHaveTextContent('Session perf-1 (Brice)')
    expect(origin).toHaveTextContent('allovoisins/front @ a41c9e2')
    expect(origin).toHaveTextContent('22 nov., 14:16')
    expect(
      within(origin).getByRole('img', {
        name: '6 missions : 1 terminée, 1 en cours, 2 prêtes, 1 à valider, 1 abandonnée',
      }),
    ).toBeInTheDocument()
    expect(await rows()).toHaveLength(4)
  })
})

describe('Missions : états (maquettes 32, chargement, erreur)', () => {
  it('vide : explication, création et commande, sans filtres', async () => {
    renderApp('/missions', { mode: 'missions-empty' })
    expect(
      await screen.findByRole('heading', { name: 'Aucune mission en attente' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Nouvelle mission' })).toHaveLength(2)
    expect(screen.getAllByText('/context-hub:next')).toHaveLength(2)
    expect(screen.queryByRole('radiogroup', { name: 'Filtrer par statut' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Voir les missions archivées' }),
    ).not.toBeInTheDocument()
  })

  it('chargement : squelette', async () => {
    renderApp('/missions', { mode: 'loading' })
    expect(await screen.findByLabelText('Chargement des missions')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('chargement : emplacement des compteurs déjà rendu, vide et masqué (pas de décalage)', async () => {
    renderApp('/missions', { mode: 'loading' })
    await screen.findByLabelText('Chargement des missions')
    for (const option of screen.getAllByRole('radio')) {
      const slot = option.querySelector('[aria-hidden="true"]')
      expect(slot).not.toBeNull()
      expect(slot).toBeEmptyDOMElement()
    }
  })

  it('erreur : message et Réessayer', async () => {
    renderApp('/missions', { mode: 'error' })
    expect(await screen.findByText('Impossible de charger les missions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument()
  })
})

const VALID_PROMPT = [
  '## Objectif',
  '',
  'Réduire le CLS de la page de recherche sous 0,05.',
  '',
  '## Constat',
  '',
  'Audit du 23 nov., commit `b52f1d0` : CLS mobile 0,21, bannière insérée après le rendu.',
  '',
  '## Fichiers',
  '',
  '- `app/pages/recherche.vue`',
  '',
  '## À faire',
  '',
  'Réserver la hauteur de la bannière avant son chargement.',
  '',
  '## Critères d’acceptation',
  '',
  '- CLS mobile ≤ 0,05 sur 3 mesures.',
].join('\n')

describe('Nouvelle mission', () => {
  it('crée la mission (prompt complet) et ouvre son détail', async () => {
    const { location } = renderApp('/missions')
    await rows()
    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle mission' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle mission' })
    const create = within(dialog).getByRole('button', { name: 'Créer la mission' })

    await userEvent.type(within(dialog).getByLabelText('Titre'), 'Bannière sans CLS')
    await userEvent.type(
      within(dialog).getByLabelText('Résumé'),
      'CLS mobile 0,21 sur la recherche',
    )
    await userEvent.type(within(dialog).getByLabelText('Origine'), 'Audit perf · recherche')
    await userEvent.type(within(dialog).getByLabelText('Repo'), 'allovoisins/front')
    await userEvent.type(within(dialog).getByLabelText('Commit'), 'b52f1d0')

    const prompt = within(dialog).getByLabelText('Prompt')
    await userEvent.clear(prompt)
    expect(create).toBeDisabled()
    await userEvent.click(prompt)
    await userEvent.paste(VALID_PROMPT)
    expect(prompt).toHaveAttribute('aria-invalid', 'false')

    await userEvent.click(create)
    await waitFor(() => {
      expect(location().pathname).toBe('/missions/banniere-sans-cls')
    })
  })
})
