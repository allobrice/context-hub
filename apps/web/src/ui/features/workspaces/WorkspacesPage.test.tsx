import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderApp } from '../../../test/renderApp.tsx'

async function rows() {
  const table = await screen.findByRole('table', { name: 'Workspaces' })
  return within(table).getAllByRole('row').slice(1)
}

describe('Workspaces : liste (maquette 23)', () => {
  it('liste les workspaces ouverts, avec sessions, claims, activité et statut', async () => {
    renderApp('/workspaces')
    const [first, second, third] = await rows()
    expect(first).toHaveTextContent('Migration de l’auth vers les sessions Nitro')
    expect(first).toHaveTextContent('migration-auth')
    expect(first).toHaveTextContent('3 actives / 4')
    expect(first).toHaveTextContent('il y a 40 s')
    expect(first).toHaveTextContent('Ouvert')
    expect(second).toHaveTextContent('1 active / 2')
    expect(third).toHaveTextContent('0 active / 1')
    expect(third).toHaveTextContent('il y a 8 j')
    expect(third).toHaveTextContent('Inactif')
    expect(screen.getByText('3 workspaces')).toBeInTheDocument()
  })

  it('la ligne mène au détail', async () => {
    const { location } = renderApp('/workspaces')
    await userEvent.click(
      await screen.findByRole('link', { name: 'Migration de l’auth vers les sessions Nitro' }),
    )
    await waitFor(() => {
      expect(location().pathname).toBe('/workspaces/migration-auth')
    })
  })

  it('filtre Fermés / Tous, gardé dans l’URL', async () => {
    const { location } = renderApp('/workspaces')
    await rows()
    await userEvent.click(screen.getByRole('radio', { name: 'Fermés' }))
    expect(location().search).toBe('?status=closed')
    const closed = await screen.findByRole('link', { name: 'Montée de version vers Node 24' })
    expect(closed.closest('[role="row"]')).toHaveTextContent('Fermé')
    await userEvent.click(screen.getByRole('radio', { name: 'Tous' }))
    expect(await screen.findByText('4 workspaces')).toBeInTheDocument()
  })

  it('la sidebar compte les workspaces ouverts', async () => {
    renderApp('/')
    const link = await screen.findByRole('link', { name: /Workspaces/ })
    expect(await within(link).findByText('3')).toBeInTheDocument()
  })
})

describe('Workspaces : états (maquettes 24, 25)', () => {
  it('vide : explication, création et commande du plugin', async () => {
    renderApp('/workspaces?mock=ws-empty', { mode: 'ws-empty' })
    expect(await screen.findByRole('heading', { name: 'Aucun workspace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un workspace' })).toBeInTheDocument()
    expect(screen.getByText('/context-hub:new "Migration auth"')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Filtrer par statut' })).not.toBeInTheDocument()
  })

  it('chargement : squelette', async () => {
    renderApp('/workspaces', { mode: 'loading' })
    expect(await screen.findByLabelText('Chargement des workspaces')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('erreur : message et Réessayer', async () => {
    renderApp('/workspaces', { mode: 'error' })
    expect(await screen.findByText('Impossible de charger les workspaces')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument()
  })
})

describe('Nouveau workspace', () => {
  it('crée le workspace (slug déduit du titre) et ouvre son détail', async () => {
    const { location } = renderApp('/workspaces')
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau workspace' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau workspace' })
    await userEvent.type(within(dialog).getByLabelText('Titre'), 'Paiement en 3 fois')
    expect(within(dialog).getByLabelText('Slug')).toHaveValue('paiement-en-3-fois')
    await userEvent.type(
      within(dialog).getByLabelText('Objectif'),
      'Ajouter le paiement fractionné',
    )
    await userEvent.type(within(dialog).getByLabelText('Repos'), 'allovoisins/front')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le workspace' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Paiement en 3 fois' }),
    ).toBeInTheDocument()
    expect(location().pathname).toBe('/workspaces/paiement-en-3-fois')
  })

  it('refuse un slug déjà pris (message du serveur dans le dialog)', async () => {
    renderApp('/workspaces')
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau workspace' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau workspace' })
    await userEvent.type(within(dialog).getByLabelText('Titre'), 'Migration auth')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le workspace' }))
    expect(
      await within(dialog).findByText('Ce slug est déjà pris par un autre workspace.'),
    ).toBeInTheDocument()
  })
})
