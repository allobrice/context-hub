import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderApp } from '../../../test/renderApp.tsx'

const NUXT = '/contexts/ctx-nuxt-conventions'
const TITLE = 'Conventions Nuxt 4 — composables & auto-imports'

async function findTitle() {
  return screen.findByRole('heading', { level: 1, name: TITLE })
}

describe('Détail (maquette 08)', () => {
  it('affiche en-tête, badges, scan et bandeau de brouillon', async () => {
    renderApp(NUXT)
    await findTitle()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Bibliothèque' })).toHaveAttribute('href', '/')
    expect(within(header).getByText('Publié')).toBeInTheDocument()
    expect(within(header).getByText('v4')).toBeInTheDocument()
    expect(within(header).getByText(/≈ 2\s140 tokens/u)).toBeInTheDocument()
    expect(within(header).getByText('Aucun secret détecté (scan v4)')).toBeInTheDocument()
    expect(header).toHaveTextContent(
      'Brouillon v5 en cours (Brice, il y a 20 min). Les sessions Claude Code lisent toujours la v4 publiée.',
    )
    expect(within(header).getByRole('link', { name: 'Reprendre le brouillon' })).toHaveAttribute(
      'href',
      '/contexts/ctx-nuxt-conventions/edit',
    )
    expect(within(header).getByRole('link', { name: 'Éditer' })).toHaveAttribute(
      'href',
      '/contexts/ctx-nuxt-conventions/edit',
    )
  })

  it('rend la version publiée en aperçu sanitisé, puis en source', async () => {
    renderApp(NUXT)
    await findTitle()
    const content = screen.getByRole('article', { name: 'Contenu' })
    expect(
      within(content).getByRole('heading', { level: 2, name: 'Conventions Nuxt 4' }),
    ).toBeInTheDocument()
    expect(within(content).getByText('v4 · publiée le 23 nov. 2026, 09:12')).toBeInTheDocument()

    await userEvent.click(within(content).getByRole('radio', { name: 'Markdown' }))
    expect(within(content).getByText(/^# Conventions Nuxt 4/)).toBeInTheDocument()
  })

  it('copie la mention et annonce la copie (aria-live)', async () => {
    const user = userEvent.setup()
    renderApp(NUXT)
    await findTitle()
    await user.click(screen.getByRole('button', { name: 'Copier la mention' }))
    expect(await navigator.clipboard.readText()).toBe(
      '@context-hub:context://nuxt/conventions-nuxt-4',
    )
    expect(screen.getByRole('button', { name: 'Copier la mention' })).toHaveTextContent('Copié')

    await user.click(screen.getByRole('button', { name: 'Copier l’URI figée en v4' }))
    expect(await navigator.clipboard.readText()).toBe('context://nuxt/conventions-nuxt-4@4')
  })

  it('bascule la configuration CLI / .mcp.json, sans jeton en clair', async () => {
    renderApp(NUXT)
    await findTitle()
    expect(screen.getByText(/claude mcp add --transport http --scope user/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '.mcp.json' }))
    expect(screen.getByText(/"mcpServers"/)).toHaveTextContent('Bearer ${CONTEXT_HUB_TOKEN}')
  })

  it('affiche métadonnées et historique ; « Comparer… » est indisponible avec une explication', async () => {
    renderApp(NUXT)
    await findTitle()
    const metadata = screen.getByRole('region', { name: 'Métadonnées' })
    expect(metadata).toHaveTextContent('Lectures MCP38 sur 7 jours')
    expect(metadata).toHaveTextContent('Créé3 sept. 2026')

    const versions = screen.getByRole('list', { name: 'Versions' })
    expect(within(versions).getAllByRole('listitem')).toHaveLength(5)
    expect(within(versions).getByText('Courante')).toBeInTheDocument()
    expect(within(versions).getByText('Camille · 14 nov. 16:40')).toBeInTheDocument()

    const compare = screen.getByRole('button', { name: 'Comparer…' })
    expect(compare).toHaveAttribute('aria-disabled', 'true')
    expect(compare).toHaveAccessibleDescription(
      'La comparaison de versions arrive dans une prochaine version.',
    )
  })
})

describe('Détail — états', () => {
  it('chargement : squelette et aria-busy (maquette 10)', async () => {
    renderApp(NUXT, { mode: 'loading' })
    expect(await screen.findByRole('region', { name: 'Chargement du contexte' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('404 : URI demandée, code et retour à la bibliothèque (maquette 11)', async () => {
    renderApp('/contexts/nuxt%2Fconventions-nuxt-5')
    expect(await screen.findByRole('heading', { name: 'Contexte introuvable' })).toBeInTheDocument()
    expect(screen.getByText('context://nuxt/conventions-nuxt-5')).toBeInTheDocument()
    expect(screen.getByText('404 · CONTEXT_NOT_FOUND · req 2c81d0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la bibliothèque' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('accepte aussi un slug dans l’URL', async () => {
    renderApp('/contexts/nuxt%2Fconventions-nuxt-4')
    expect(await findTitle()).toBeInTheDocument()
  })

  it('erreur de stockage : message et Réessayer', async () => {
    renderApp(NUXT, { mode: 'error' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le contexte')
  })
})

describe('Détail — actions', () => {
  it('archive après confirmation, puis désarchive depuis le bandeau', async () => {
    renderApp(NUXT)
    await findTitle()
    await userEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Archiver ce contexte ?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }))

    expect(
      await screen.findByText('Contexte archivé : les sessions Claude Code ne le lisent plus.'),
    ).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('Archivé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archiver' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Désarchiver' }))
    expect(await within(screen.getByRole('banner')).findByText('Publié')).toBeInTheDocument()
  })

  it('restaure une ancienne version dans le brouillon, sans publier', async () => {
    renderApp(NUXT)
    await findTitle()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurer la v2' }))
    const dialog = screen.getByRole('dialog', { name: 'Restaurer la v2 ?' })
    expect(dialog).toHaveTextContent('remplace le brouillon v5 en cours')
    expect(dialog).toHaveTextContent('les sessions continuent de lire la v4')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Restaurer dans le brouillon' }),
    )

    const versions = screen.getByRole('list', { name: 'Versions' })
    expect(await within(versions).findByText('Restauration de la v2')).toBeInTheDocument()
    expect(screen.getByText('v2 restaurée dans le brouillon v5.')).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('v4')).toBeInTheDocument()
  })

  it('annule sans rien changer', async () => {
    renderApp(NUXT)
    await findTitle()
    await userEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('Publié')).toBeInTheDocument()
  })
})

describe('Connexion MCP', () => {
  it('reprend la configuration du Détail', async () => {
    renderApp('/mcp')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connexion MCP' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copier la configuration' })).toBeInTheDocument()
  })
})
