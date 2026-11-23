import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DraftRejectedError } from '@context-hub/domain/shared/errors.ts'

import { createTestServices, renderApp } from '../../../test/renderApp.tsx'

const EDIT = '/contexts/ctx-nuxt-conventions/edit'

function contentValue(): string {
  const textarea = screen.getByRole('textbox', { name: 'Contenu Markdown du contexte' })
  return textarea instanceof HTMLTextAreaElement ? textarea.value : ''
}

async function findPublish(name: string | RegExp = /^Publier/) {
  return screen.findByRole('button', { name })
}

describe('Édition — scan et blocage de publication (maquette 12)', () => {
  it('bloque la publication tant qu’un secret est détecté, raison exposée', async () => {
    renderApp(EDIT)
    const publish = await findPublish('Publier la v5')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 secret potentiel détecté : publication bloquée')
    expect(alert).toHaveTextContent('Ligne 15 · clé d’API (motif sk_live_).')
    expect(publish).toHaveAttribute('aria-disabled', 'true')
    expect(publish).toHaveAccessibleDescription(/Publication impossible : secret potentiel détecté/)
    expect(
      screen.getByRole('textbox', { name: 'Contenu Markdown du contexte' }),
    ).toHaveAccessibleDescription(/publication bloquée/)
  })

  it('« Remplacer par ${NUXT_API_KEY} » corrige le contenu et débloque la publication', async () => {
    const view = renderApp(EDIT)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remplacer par ${NUXT_API_KEY}' }),
    )
    expect(contentValue()).toContain('NUXT_API_KEY=${NUXT_API_KEY}')
    expect(await screen.findByText('Aucun secret détecté')).toBeInTheDocument()

    const publish = screen.getByRole('button', { name: 'Publier la v5' })
    expect(publish).toHaveAttribute('aria-disabled', 'false')
    await userEvent.click(publish)
    await waitFor(() => {
      expect(view.location().pathname).toBe('/contexts/ctx-nuxt-conventions')
    })
    // Le Détail (route lazy) affiche le scan de la version publiée : la v5 nettoyée.
    expect(await screen.findByText('Aucun secret détecté (scan v5)')).toBeInTheDocument()
  })

  it('affiche les findings d’un refus du serveur (422) même absents du scan local', async () => {
    const services = createTestServices()
    vi.spyOn(services.contexts, 'publish').mockRejectedValue(
      new DraftRejectedError(
        ['secret-detected'],
        [{ kind: 'secret', line: 3, pattern: 'ghp_', label: 'jeton GitHub' }],
      ),
    )
    renderApp(EDIT, { services })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remplacer par ${NUXT_API_KEY}' }),
    )
    expect(await screen.findByText('Aucun secret détecté')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Publier la v5' }))

    expect(await screen.findByText(/Ligne 3 · jeton GitHub \(motif ghp_\)/)).toBeInTheDocument()
    expect(await screen.findByText(/Enregistrement refusé : /)).toBeInTheDocument()
  })

  it('« Faux positif… » exige une justification puis ignore le signalement', async () => {
    renderApp(EDIT)
    await userEvent.click(await screen.findByRole('button', { name: 'Faux positif ligne 15…' }))
    const dialog = screen.getByRole('dialog', { name: 'Faux positif ligne 15' })
    const confirm = within(dialog).getByRole('button', { name: 'Ignorer ce signalement' })
    expect(confirm).toBeDisabled()
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Justification (requise)' }),
      'clé factice',
    )
    await userEvent.click(confirm)

    expect(await screen.findByText(/1 faux positif déclaré/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publier la v5' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })

  it('suggère des tags avec compteurs (combobox)', async () => {
    renderApp(EDIT)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Retirer le tag data-fetching' }),
    )
    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'data')
    const listbox = await screen.findByRole('listbox', { name: 'Suggestions de tags' })
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'data-fetching6 contextes',
      'database2 contextes',
      'data-viz1 contexte',
      'Créer le tag « data »',
    ])
  })

  it('identifiant figé depuis la v1', async () => {
    renderApp(EDIT)
    const slug = await screen.findByRole('textbox', { name: 'Identifiant (URI MCP)' })
    expect(slug).toHaveAttribute('readonly')
    expect(slug).toHaveAccessibleDescription(
      'Figé depuis la v1 : le changer casserait les mentions existantes.',
    )
  })
})

describe('Création (maquette 14)', () => {
  it('génère l’identifiant, fait apparaître le repo en portée Projet, puis enregistre', async () => {
    const view = renderApp('/contexts/new')
    expect(await screen.findByText('Pas encore enregistré')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publier' })).toHaveAccessibleDescription(
      /titre requis/,
    )

    await userEvent.type(screen.getByRole('textbox', { name: 'Titre' }), 'Hydratation Pinia')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Collection' }), 'Vue')
    expect(screen.getByRole('textbox', { name: 'Identifiant (URI MCP)' })).toHaveValue(
      'vue/hydratation-pinia',
    )

    await userEvent.click(screen.getByRole('radio', { name: 'Projet' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Repo du projet' }),
      'allovoisins/front',
    )
    expect(screen.getByText('Servi aux sessions ouvertes dans ce repo.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Gras' }))
    expect(screen.getByRole('textbox', { name: 'Contenu Markdown du contexte' })).toHaveValue(
      '**texte**',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    await waitFor(() => {
      expect(view.location().pathname).toBe('/contexts/ctx-vue-hydratation-pinia/edit')
    })
    expect(await screen.findByText(/Brouillon enregistré/)).toBeInTheDocument()
  })

  it('préremplit le titre depuis « Créer « … » » de la Bibliothèque', async () => {
    renderApp('/contexts/new?title=pinia+ssr')
    expect(await screen.findByRole('textbox', { name: 'Titre' })).toHaveValue('pinia ssr')
  })
})

describe('Conflit de version (maquette 15)', () => {
  it('refuse l’enregistrement, montre les différences et permet de repartir de la v5', async () => {
    renderApp(EDIT, { mode: 'conflict' })
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer le brouillon' }))
    const alert = await screen.findByRole('alert', {
      name: 'Enregistrement refusé : conflit de version',
    })
    expect(alert).toHaveTextContent('Enregistrement refusé : conflit de version')
    expect(alert).toHaveTextContent('Camille a publié la v5 il y a 2 min pendant votre édition.')
    expect(screen.getByText('Non enregistré')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publier la v5' })).toHaveAccessibleDescription(
      'Résolvez d’abord le conflit de version.',
    )

    await userEvent.click(within(alert).getByRole('button', { name: 'Voir les différences' }))
    const diff = screen.getByRole('dialog', { name: 'Différences avec la v5 publiée' })
    expect(within(diff).getByText(/^− - Les middlewares nommés/)).toBeInTheDocument()
    await userEvent.click(within(diff).getByRole('button', { name: 'Retour à l’édition' }))

    await userEvent.click(within(alert).getByRole('button', { name: 'Repartir de la v5' }))
    expect(contentValue()).toContain('Les middlewares nommés')
    expect(screen.getByRole('button', { name: 'Revenir à mon contenu' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(await screen.findByText(/Brouillon enregistré/)).toBeInTheDocument()
    expect(screen.queryByText('Enregistrement refusé : conflit de version')).not.toBeInTheDocument()
  })
})

describe('Garde de navigation et copie locale', () => {
  it('demande confirmation avant de quitter avec des modifications non enregistrées', async () => {
    const view = renderApp(EDIT)
    const title = await screen.findByRole('textbox', { name: 'Titre' })
    await userEvent.type(title, ' (v2)')
    await userEvent.click(screen.getByRole('link', { name: 'Annuler' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Quitter sans enregistrer ?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(view.location().pathname).toBe(EDIT)

    await userEvent.click(screen.getByRole('link', { name: 'Annuler' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Quitter' }),
    )
    await waitFor(() => {
      expect(view.location().pathname).toBe('/contexts/ctx-nuxt-conventions')
    })
  })

  it('propose de restaurer une copie locale plus récente', async () => {
    localStorage.setItem(
      'context-hub:draft:ctx-nuxt-conventions',
      JSON.stringify({
        draft: {
          title: 'Titre local',
          slug: 'nuxt/conventions-nuxt-4',
          description: '',
          collectionId: 'nuxt',
          tags: ['nuxt'],
          scope: { kind: 'team', team: 'allovoisins' },
          content: '# Local',
          versionNote: '',
        },
        falsePositives: [],
        baseVersion: 4,
        savedAt: '2026-11-23T11:00:00+01:00',
      }),
    )
    renderApp(EDIT)
    expect(
      await screen.findByText(/Une copie locale non enregistrée de ce brouillon existe/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
    expect(screen.getByRole('textbox', { name: 'Titre' })).toHaveValue('Titre local')
    expect(screen.getByText('Non enregistré')).toBeInTheDocument()
  })
})
