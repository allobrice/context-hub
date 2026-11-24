import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createTestServices, renderApp } from '../../../test/renderApp.tsx'

const URL = '/workspaces/migration-auth'

/** Services avec un polling court : l'ajout incrémental se teste sans attendre 3 s. */
function liveServices() {
  return createTestServices('normal', { mcpUrl: null, workspacePollMs: 30 })
}

async function journal() {
  return screen.findByRole('list', {
    name: 'Entrées du journal, de la plus récente à la plus ancienne',
  })
}

function seqs(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('listitem')
    .map((item) => /^#\d+/.exec(item.textContent)?.[0] ?? '')
}

describe('Workspace : détail (maquette 26)', () => {
  it('en-tête, journal, participants, claims et contextes liés', async () => {
    renderApp(URL)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Migration de l’auth vers les sessions Nitro',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('3 sessions actives sur 4 · 2 zones réservées · créé par Brice il y a 2 h'),
    ).toBeInTheDocument()

    const list = await journal()
    expect(seqs(list).slice(0, 7)).toEqual(['#48', '#47', '#46', '#45', '#44', '#43', '#42'])
    const blocked = within(list).getAllByRole('listitem')[0]
    expect(blocked).toHaveTextContent('Systèmecontext-hubhook PreToolUseil y a 40 s')
    const redacted = within(list).getAllByRole('listitem')[6]
    expect(redacted).toHaveTextContent('[1 secret masqué par le scan]')

    expect(screen.getByRole('button', { name: 'Tout 48' })).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Charger les entrées précédentes (#1–#28)' }),
    ).toBeInTheDocument()

    const participants = screen.getByRole('region', { name: 'Participants' })
    expect(participants).toHaveTextContent('3 actives / 4')
    expect(participants).toHaveTextContent('inactif · 25 min')
    const claims = screen.getByRole('region', { name: 'Zones réservées (claims)' })
    expect(
      within(claims)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('apps/web/src/auth/**'),
      expect.stringContaining('server/api/auth/**'),
    ])
    expect(within(claims).getByText('expire dans 4 min')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Conventions Nuxt 4/ })).toHaveAttribute(
      'href',
      '/contexts/ctx-nuxt-conventions',
    )
    expect(screen.getByText('/context-hub:join migration-auth')).toBeInTheDocument()
  })

  it('filtre par type : Décisions ne montre que les décisions chargées', async () => {
    renderApp(URL)
    const list = await journal()
    await userEvent.click(screen.getByRole('button', { name: /^Décisions/ }))
    expect(seqs(list)).toEqual(['#47'])
    expect(screen.getByRole('link', { name: 'Proposer comme contexte' })).toHaveAttribute(
      'href',
      expect.stringContaining('/contexts/new?title=Le+cookie+de+session'),
    )
  })

  it('charge les entrées précédentes sans dupliquer', async () => {
    renderApp(URL)
    const list = await journal()
    await userEvent.click(screen.getByRole('button', { name: /Charger les entrées précédentes/ }))
    await waitFor(() => {
      expect(seqs(list)).toHaveLength(40)
    })
    expect(new Set(seqs(list)).size).toBe(40)
  })
})

describe('Workspace : en direct', () => {
  it('ajoute les nouvelles entrées par polling `since`, sans recharger le journal', async () => {
    const services = liveServices()
    const readEntries = vi.spyOn(services.workspaces, 'readEntries')
    renderApp(URL, { services })
    await journal()
    expect(await screen.findByText(/En direct · mis à jour il y a/)).toBeInTheDocument()

    // Une autre session écrit pendant que la page est ouverte.
    await services.workspaces.postEntry('migration-auth', {
      kind: 'decision',
      body: 'Refresh silencieux côté client.',
    })
    expect(await screen.findByText('Refresh silencieux côté client.')).toBeInTheDocument()
    expect(seqs(await journal())[0]).toBe('#49')

    // Une seule lecture « before » (la première page) ; ensuite uniquement des lectures `since`.
    const pages = readEntries.mock.calls.map(([, query]) =>
      'before' in query ? 'before' : 'since',
    )
    expect(pages.filter((kind) => kind === 'before')).toEqual(['before'])
    expect(pages.filter((kind) => kind === 'since').length).toBeGreaterThan(0)
  })

  it('composer : publie comme brice · ui, le secret est masqué par le serveur', async () => {
    renderApp(URL)
    await journal()
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Message' }),
      'Clé de test sk_live_51HxAbCdEfGh123',
    )
    expect(screen.getByText(/Un secret a été détecté/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'question')
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }))
    const entry = (await screen.findByText(/Clé de test \[secret masqué\]/)).closest('li')
    expect(entry).toHaveTextContent('#49QuestionuiBrice')
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('')
  })

  it('libération forcée d’un claim, après confirmation', async () => {
    renderApp(URL)
    await journal()
    await userEvent.click(
      screen.getByRole('button', { name: 'Libérer de force le claim apps/web/src/auth/**' }),
    )
    const dialog = await screen.findByRole('alertdialog', { name: 'Libérer de force ce claim ?' })
    expect(dialog).toHaveTextContent('réservée par la session web-1 (Brice)')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Libérer' }))
    const claims = screen.getByRole('region', { name: 'Zones réservées (claims)' })
    await waitFor(() => {
      expect(claims).not.toHaveTextContent('apps/web/src/auth/**')
    })
    expect(
      await screen.findByText(/Brice a libéré de force apps\/web\/src\/auth\/\*\*/),
    ).toBeInTheDocument()
  })

  it('fermer le workspace, après confirmation : lecture seule', async () => {
    renderApp(URL)
    await journal()
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le workspace' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Fermer le workspace ?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fermer le workspace' }))
    expect(await screen.findByText(/lecture seule\. Claims libérés/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Publier dans le journal' })).not.toBeInTheDocument()
  })
})

describe('Workspace : états (maquettes 28–30)', () => {
  it('fermé : bandeau, ni composer ni bloc Rejoindre, participants déconnectés, claims vides', async () => {
    renderApp(`${URL}?mock=ws-closed`, { mode: 'ws-closed' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Workspace fermé le .* par Brice : lecture seule\. Claims libérés, sessions déconnectées\./,
    )
    expect(screen.getByText('Fermé')).toBeInTheDocument()
    expect(screen.getByText(/48 entrées · 4 participants · ouvert pendant 2 h/)).toBeInTheDocument()
    await journal()
    expect(screen.queryByRole('form', { name: 'Publier dans le journal' })).not.toBeInTheDocument()
    expect(screen.queryByText('Rejoindre depuis Claude Code')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fermer le workspace' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Participants' })).toHaveTextContent('déconnecté')
    expect(screen.getByText('Aucune zone réservée.')).toBeInTheDocument()
    expect(screen.getByText('Archivé')).toBeInTheDocument()
  })

  it('chargement : squelette', async () => {
    renderApp(URL, { mode: 'loading' })
    expect(await screen.findByLabelText('Chargement du workspace')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('403 : accès refusé, retour à la liste', async () => {
    renderApp(`${URL}?mock=ws-forbidden`, { mode: 'ws-forbidden' })
    expect(
      await screen.findByRole('heading', { name: 'Accès refusé à ce workspace' }),
    ).toBeInTheDocument()
    expect(screen.getByText('403 · WORKSPACE_FORBIDDEN')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour aux workspaces' })).toHaveAttribute(
      'href',
      '/workspaces',
    )
  })

  it('slug inconnu : introuvable', async () => {
    renderApp('/workspaces/inconnu')
    expect(
      await screen.findByRole('heading', { name: 'Workspace introuvable' }),
    ).toBeInTheDocument()
  })
})
