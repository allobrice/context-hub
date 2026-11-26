import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LCP_PROMPT } from '@context-hub/domain/fixtures/missions.ts'
import { MissionNotFoundError } from '@context-hub/domain/missions/errors.ts'

import { createTestServices, renderApp } from '../../../../test/renderApp.tsx'

const READY = '/missions/perf-lcp-carrousel'
const DRAFT = '/missions/perf-hydratation-footer'
const IN_PROGRESS = '/missions/perf-precharger-polices'
const STALE = '/missions/perf-decouper-chunk-vendor'
const DONE = '/missions/perf-images-avif'
const DROPPED = '/missions/perf-prefetch-liens'

async function title(name: string) {
  return screen.findByRole('heading', { level: 1, name })
}

/** Ligne de méta de l'en-tête : badge de statut, tags, repo, portée, échéance. */
function meta(): HTMLElement {
  const scope = screen.getByText(/^Portée /)
  if (scope.parentElement === null) throw new Error('méta absente')
  return scope.parentElement
}

function headerButtons(): string[] {
  const header = screen.getByRole('heading', { level: 1 }).closest('header')
  if (header === null) throw new Error('en-tête absent')
  return within(header)
    .queryAllByRole('button')
    .map((button) => button.textContent)
}

function currentStep(): HTMLElement | undefined {
  const timeline = screen.getByRole('list', { name: 'Cycle de vie de la mission' })
  return within(timeline)
    .getAllByRole('listitem')
    .find((item) => item.getAttribute('aria-current') === 'step')
}

function history(): string[] {
  const list = screen.getByRole('list', { name: 'Historique, du plus récent au plus ancien' })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.firstElementChild?.textContent ?? '')
}

function region(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('Mission : détail prête (maquette 35)', () => {
  it('en-tête, frise, prompt rendu, contexte lié et colonne de droite', async () => {
    renderApp(READY)
    await title('Lazy-load du carrousel de la home')
    expect(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).toHaveTextContent(
      'Missions/perf-lcp-carrousel',
    )
    expect(screen.getByRole('link', { name: 'Missions' })).toHaveAttribute('href', '/missions')
    expect(screen.getByTitle('Priorité P1')).toHaveTextContent('P1')
    expect(meta()).toHaveTextContent(
      'Prêteperflcpnuxtallovoisins/front·Portée équipe·expire dans 13 j',
    )
    expect(headerButtons()).toEqual(['Abandonner…', 'Modifier'])
    expect(currentStep()).toHaveTextContent('Prête (étape actuelle)validée par Brice')

    const prompt = screen.getByRole('article', { name: 'Prompt de la mission' })
    expect(prompt).toHaveTextContent(/≈ \d+ tokens · autonome/)
    expect(within(prompt).getByRole('heading', { name: 'Objectif' })).toBeInTheDocument()
    expect(within(prompt).getByRole('link', { name: /Conventions Nuxt 4/ })).toHaveAttribute(
      'href',
      '/contexts/ctx-nuxt-conventions',
    )
    expect(region('Résultat')).toHaveTextContent(
      'Pas encore de résultat. La session qui traitera la mission le renseignera à la fin',
    )

    const take = region('Prendre depuis Claude Code')
    expect(within(take).getByText('/context-hub:take perf-lcp-carrousel')).toBeInTheDocument()
    expect(within(take).getByText('/context-hub:next perf')).toBeInTheDocument()
    expect(within(take).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByRole('region', { name: 'Prise en charge' })).not.toBeInTheDocument()

    const code = region('Code d’origine')
    expect(within(code).getAllByText('inchangé')).toHaveLength(3)
    const origin = region('Origine et sécurité')
    expect(origin).toHaveTextContent('Session perf-1 (Brice)')
    expect(origin).toHaveTextContent('Aucun secret, aucune instruction suspecte')
    expect(origin).toHaveTextContent('Validée par Brice le 22 nov.')
    expect(history()).toEqual(['Validée par Brice', 'Créée par perf-1 depuis l’audit perf'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('le prompt est rendu sans HTML brut', async () => {
    const services = createTestServices()
    const { mission } = await services.missions.get('perf-lcp-carrousel')
    await services.missions.update('perf-lcp-carrousel', {
      title: mission.title,
      summary: mission.summary,
      priority: mission.priority,
      tags: mission.tags,
      prompt: `${LCP_PROMPT}\n\n<script>window.pwned = 1</script>\n\n<img src="https://evil.test/x.png" onerror="alert(1)"> <b>gras</b>`,
      expectedUpdatedAt: mission.updatedAt,
    })
    const { container } = renderApp(READY, { services })
    await title('Lazy-load du carrousel de la home')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.queryByText(/pwned/)).not.toBeInTheDocument()
  })

  it('Abandonner exige une raison puis archive la mission', async () => {
    renderApp(READY)
    await title('Lazy-load du carrousel de la home')
    await userEvent.click(screen.getByRole('button', { name: 'Abandonner…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Abandonner la mission ?' })
    const confirm = within(dialog).getByRole('button', { name: 'Abandonner la mission' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Raison (requise)'), '   ')
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Raison (requise)'), 'Déjà corrigé')
    await userEvent.click(confirm)

    await waitFor(() => {
      expect(meta()).toHaveTextContent(/^Abandonnée/)
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(region('Résultat')).toHaveTextContent('Déjà corrigé')
    expect(headerButtons()).toEqual(['Rouvrir'])
    expect(history()[0]).toBe('Abandonnée par Brice')
  })

  it('Modifier ouvre le formulaire d’édition', async () => {
    renderApp(READY)
    await title('Lazy-load du carrousel de la home')
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(screen.getByRole('dialog', { name: 'Modifier la mission' })).toBeInTheDocument()
  })
})

describe('Mission : à valider (maquette 34)', () => {
  it('bandeau de validation, actions et origine en attente', async () => {
    renderApp(DRAFT)
    await title('Hydratation différée du footer')
    expect(meta()).toHaveTextContent(/^À valider/)
    expect(headerButtons()).toEqual(['Rejeter…', 'Modifier', 'Valider la mission'])
    expect(screen.getByText('Validation requise.').parentElement).toHaveTextContent(
      'Cette mission a été écrite par une session et sera exécutée par d’autres, en portée équipe.',
    )
    expect(currentStep()).toHaveTextContent('À valider (étape actuelle)écrite par perf-1')
    expect(region('Origine et sécurité')).toHaveTextContent('En attente (portée équipe)')
    expect(
      screen.queryByRole('region', { name: 'Prendre depuis Claude Code' }),
    ).not.toBeInTheDocument()
  })

  it('Valider rend la mission prête', async () => {
    renderApp(DRAFT)
    await title('Hydratation différée du footer')
    await userEvent.click(screen.getByRole('button', { name: 'Valider la mission' }))
    await waitFor(() => {
      expect(meta()).toHaveTextContent(/^Prête/)
    })
    expect(screen.queryByText('Validation requise.')).not.toBeInTheDocument()
    expect(history()[0]).toBe('Validée par Brice')
    expect(currentStep()).toHaveTextContent('Prête (étape actuelle)validée par Brice')
    expect(region('Prendre depuis Claude Code')).toBeInTheDocument()
  })

  it('Valider ne redemande pas le détail renvoyé ; la sidebar est rechargée', async () => {
    const services = createTestServices()
    const get = vi.spyOn(services.missions, 'get')
    const overview = vi.spyOn(services.overview, 'getOverview')
    renderApp(DRAFT, { services })
    await title('Hydratation différée du footer')
    const overviewCalls = overview.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Valider la mission' }))
    await waitFor(() => {
      expect(meta()).toHaveTextContent(/^Prête/)
    })
    await waitFor(() => {
      expect(overview.mock.calls.length).toBeGreaterThan(overviewCalls)
    })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('Rejeter (raison facultative) supprime la mission et revient à la file', async () => {
    const { location, services } = renderApp(DRAFT)
    await title('Hydratation différée du footer')
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Rejeter la mission ?' })
    await userEvent.type(within(dialog).getByLabelText('Raison (facultative)'), 'Hors périmètre')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rejeter la mission' }))

    await waitFor(() => {
      expect(location().pathname).toBe('/missions')
    })
    await expect(services.missions.get('perf-hydratation-footer')).rejects.toBeInstanceOf(
      MissionNotFoundError,
    )
  })

  it('Annuler un rejet ne change rien', async () => {
    renderApp(DRAFT)
    await title('Hydratation différée du footer')
    await userEvent.click(screen.getByRole('button', { name: 'Rejeter…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(meta()).toHaveTextContent(/^À valider/)
  })
})

describe('Mission : en cours (maquette 37)', () => {
  it('prise en charge, résultat attendu et historique fusionné', async () => {
    renderApp(IN_PROGRESS)
    await title('Précharger TT Chocolates et passer en font-display: swap')
    expect(meta()).toHaveTextContent(/^En cours/)
    expect(headerButtons()).toEqual(['Libérer'])
    expect(currentStep()).toHaveTextContent('En cours (étape actuelle)web-2 · 18 min')

    const hold = region('Prise en charge')
    expect(hold).toHaveTextContent('web-2Camille · allovoisins/front')
    expect(hold).toHaveTextContent('Réservée depuis 18 min, dernière activité il y a 1 min.')
    expect(hold).toHaveTextContent(
      'La réservation est relâchée automatiquement après 30 min sans activité (dans 29 min) : la mission redevient alors prête.',
    )
    expect(region('Résultat')).not.toHaveClass('resultDone')
    expect(region('Résultat')).toHaveTextContent(
      'En cours de traitement par web-2. La session enregistrera ici son résumé, ses livrables et ses mesures avec mission_complete, ou une raison d’abandon avec mission_drop.',
    )
    expect(
      screen.queryByRole('region', { name: 'Prendre depuis Claude Code' }),
    ).not.toBeInTheDocument()
    expect(history()[0]).toBe('Prise par web-2 · code vérifié à jour')
  })

  it('Libérer, après confirmation, rend la mission prête', async () => {
    renderApp(IN_PROGRESS)
    await title('Précharger TT Chocolates et passer en font-display: swap')
    await userEvent.click(within(region('Prise en charge')).getByRole('button'))
    const dialog = screen.getByRole('alertdialog', { name: 'Libérer la mission ?' })
    expect(dialog).toHaveTextContent('web-2 (Camille) perd sa réservation')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Libérer la mission' }))

    await waitFor(() => {
      expect(meta()).toHaveTextContent(/^Prête/)
    })
    expect(screen.queryByRole('region', { name: 'Prise en charge' })).not.toBeInTheDocument()
    expect(region('Prendre depuis Claude Code')).toBeInTheDocument()
    expect(history()[0]).toBe('Libérée par Brice')
  })
})

describe('Mission : code modifié (maquette 36)', () => {
  it('bandeau de fraîcheur et état de chaque fichier', async () => {
    renderApp(STALE)
    await title('Découper le chunk vendor (lodash, dayjs)')
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(
      'Le code a changé depuis la création. 2 des 3 fichiers cités ont été modifiés après a41c9e2. La session qui prendra la mission revérifiera le constat avant d’agir.',
    )
    expect(banner).toHaveTextContent('Dernier contrôle : web-2, il y a 2 h.')

    const rows = within(region('Code d’origine'))
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(rows).toEqual([
      'nuxt.config.tsinchangé',
      'app/utils/dates.tsmodifié',
      'app/utils/collections.tsmodifié',
    ])
    expect(history().slice(0, 2)).toEqual([
      'Libérée par web-2',
      'Prise par web-2 · 2 fichiers modifiés',
    ])
  })
})

describe('Mission : terminée (maquette 38)', () => {
  it('résultat avec mesures avant → après, livrable et auteur', async () => {
    renderApp(DONE)
    await title('Servir les visuels de la home en AVIF')
    expect(meta()).toHaveTextContent(/^Terminée/)
    expect(meta()).toHaveTextContent('archivée le 23 nov.')
    expect(headerButtons()).toEqual(['Rouvrir'])
    expect(currentStep()).toHaveTextContent('Terminée (étape actuelle)résultat enregistré')

    const result = region('Résultat')
    expect(result).toHaveClass('resultDone')
    expect(result).toHaveTextContent('Visuels servis en AVIF par @nuxt/image')
    const metrics = within(result)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(metrics).toEqual([
      'Poids des images1,9 Mo → 0,46 Mo',
      'LCP mobile3,8 s → 3,4 s',
      'LivrablePR !4812',
    ])
    expect(result).toHaveTextContent(
      'Terminée par web-2 (Camille) le 23 nov. à 08:12 · critères d’acceptation déclarés remplis',
    )
    expect(
      screen.queryByRole('region', { name: 'Prendre depuis Claude Code' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Prise en charge' })).not.toBeInTheDocument()
    expect(history()[0]).toBe('Terminée par web-2 · PR !4812')
  })

  it('Proposer comme contexte préremplit l’éditeur', async () => {
    renderApp(DONE)
    await title('Servir les visuels de la home en AVIF')
    const link = screen.getByRole('link', { name: 'Proposer comme contexte' })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('/contexts/new?')).toBe(true)
    const params = new URLSearchParams(href.slice(href.indexOf('?')))
    expect(params.get('title')).toBe('Servir les visuels de la home en AVIF')
    expect(params.get('description')).toBe('Les visuels de la home pèsent 1,9 Mo en JPEG')
    expect(params.get('content')).toContain('| Poids des images | 1,9 Mo | 0,46 Mo |')
    expect(params.get('content')).toContain('- PR !4812')
    expect(params.get('content')).toContain('Issu de la mission perf-images-avif')
  })

  it('Rouvrir relance un cycle', async () => {
    renderApp(DONE)
    await title('Servir les visuels de la home en AVIF')
    await userEvent.click(screen.getByRole('button', { name: 'Rouvrir' }))
    await waitFor(() => {
      expect(meta()).toHaveTextContent(/^Prête/)
    })
    expect(history()[0]).toBe('Rouverte par Brice')
    expect(region('Résultat')).toHaveTextContent('Pas encore de résultat.')
  })
})

describe('Mission : abandonnée', () => {
  it('raison d’abandon et Rouvrir', async () => {
    renderApp(DROPPED)
    await title('Désactiver le prefetch des liens du menu')
    expect(meta()).toHaveTextContent(/^Abandonnée/)
    expect(headerButtons()).toEqual(['Rouvrir'])
    expect(region('Résultat')).toHaveTextContent(
      'Abandonnée par Brice le 23 nov. à 07:12. Raison :Doublon : le prefetch du menu est déjà désactivé par la PR !4790.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Rouvrir' }))
    await waitFor(() => {
      expect(meta()).toHaveTextContent(/^Prête/)
    })
  })
})

describe('Mission : états', () => {
  it('slug inconnu : mission introuvable avec retour à la file', async () => {
    renderApp('/missions/inconnue')
    expect(await screen.findByRole('heading', { name: 'Mission introuvable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la file' })).toHaveAttribute(
      'href',
      '/missions',
    )
    expect(screen.getByText('404 · inconnue')).toBeInTheDocument()
  })

  it('chargement', async () => {
    renderApp(READY, { mode: 'loading' })
    expect(await screen.findByLabelText('Chargement de la mission')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('erreur de chargement', async () => {
    renderApp(READY, { mode: 'error' })
    expect(await screen.findByText('Impossible de charger la mission')).toBeInTheDocument()
  })
})
