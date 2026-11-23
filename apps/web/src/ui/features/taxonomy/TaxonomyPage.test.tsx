import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RepositoryUnavailableError } from '../../../application/errors.ts'
import { createTestServices, renderApp } from '../../../test/renderApp.tsx'

async function findTagRow(name: string) {
  const table = await screen.findByRole('table', { name: 'Tags' })
  const cell = await within(table).findByText(name, { selector: 'span' })
  const row = cell.closest('tr')
  if (!row) throw new Error(`Ligne introuvable : ${name}`)
  return row
}

describe('Tags (maquette 16)', () => {
  it('liste les 34 tags triés par usage, avec onglets comptés et tags proches', async () => {
    renderApp('/taxonomy')
    expect(await screen.findByRole('tab', { name: 'Tags 34' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByRole('tab', { name: 'Collections 6' })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Tags' })
    await findTagRow('legacy-webpack')
    expect(within(table).getAllByRole('row')).toHaveLength(35)
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('conventions119')
    expect(screen.getByText(/3 tags proches détectés/)).toHaveTextContent(
      '3 tags proches détectés : vue, vue3, vuejs. Les fusionner améliore la recherche MCP.',
    )
    expect(within(await findTagRow('legacy-webpack')).getByText('Inutilisé')).toBeInTheDocument()
  })

  it('renommer vers un nom existant avertit puis fusionne', async () => {
    renderApp('/taxonomy')
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer vue3' }))
    const input = screen.getByRole('textbox', { name: 'Nouveau nom de vue3' })
    await userEvent.clear(input)
    await userEvent.type(input, 'vue')
    expect(input).toHaveAccessibleDescription(
      '« vue » existe déjà (8 contextes) : renommer revient à fusionner.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fusionner' }))

    const vueRow = await findTagRow('vue')
    expect(await within(vueRow).findByText('12')).toBeInTheDocument()
    expect(screen.queryByText('vue3', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('renomme vers un nom libre ; Échap annule et rend le focus', async () => {
    renderApp('/taxonomy')
    const rename = await screen.findByRole('button', { name: 'Renommer a11y' })
    await userEvent.click(rename)
    await userEvent.keyboard('{Escape}')
    expect(rename).toHaveFocus()

    await userEvent.click(rename)
    const input = screen.getByRole('textbox', { name: 'Nouveau nom de a11y' })
    await userEvent.clear(input)
    await userEvent.type(input, 'accessibilite{Enter}')
    expect(await findTagRow('accessibilite')).toBeInTheDocument()
  })
})

describe('Fusion (maquette 17)', () => {
  it('affiche l’impact chiffré et fusionne vue3 + vuejs dans vue', async () => {
    renderApp('/taxonomy')
    await userEvent.click(await screen.findByRole('button', { name: 'Fusionner…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Fusionner 2 tags' })
    expect(within(dialog).getByRole('combobox', { name: 'Dans le tag' })).toHaveDisplayValue(
      'vue · 8 contextes',
    )
    expect(await within(dialog).findByText(/reçoivent le tag/)).toHaveTextContent(
      '7 contextes reçoivent le tag vue (dont 5 publiés).',
    )
    expect(dialog).toHaveTextContent('2 contextes avaient déjà vue : pas de doublon créé.')
    expect(dialog).toHaveTextContent(
      'vue3 et vuejs sont supprimés. Aucune version n’est créée, les URI ne changent pas.',
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Fusionner dans vue' }))
    expect(await within(await findTagRow('vue')).findByText('13')).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'Tags 32' })).toBeInTheDocument()
  })

  it('fusionne la sélection, y compris dans un nouveau tag', async () => {
    renderApp('/taxonomy')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner wcag' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner a11y' }))
    expect(screen.getByText('2 sélectionnés')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fusionner la sélection' }))

    const dialog = await screen.findByRole('dialog', { name: 'Fusionner 2 tags' })
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Dans le tag' }),
      'Nouveau tag…',
    )
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Nom du nouveau tag' }),
      'accessibilite',
    )
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Fusionner dans accessibilite' }),
    )
    expect(await findTagRow('accessibilite')).toHaveTextContent('accessibilite3')
  })

  it('supprime un tag après confirmation', async () => {
    renderApp('/taxonomy')
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer debug' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer le tag « debug » ?' })
    expect(dialog).toHaveTextContent('Retiré de 1 contexte (dont 0 publié).')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le tag' }))
    expect(await screen.findByRole('tab', { name: 'Tags 33' })).toBeInTheDocument()
  })
})

describe('Échec d’une opération (audit phase 7)', () => {
  it('affiche l’erreur de stockage dans le dialog de fusion, sans le fermer', async () => {
    const services = createTestServices()
    vi.spyOn(services.taxonomy, 'mergeTags').mockRejectedValueOnce(
      new RepositoryUnavailableError('SQLITE_BUSY', 'database is locked', '7f3a91'),
    )
    renderApp('/taxonomy', { services })
    await userEvent.click(await screen.findByRole('button', { name: 'Fusionner…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Fusionner 2 tags' })
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Fusionner dans vue' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Le stockage n’a pas répondu (SQLITE_BUSY · database is locked · req 7f3a91). Rien n’a été modifié.',
    )
  })
})

describe('Collections (maquettes 21–22)', () => {
  it('liste les collections ; « Sans collection » n’est ni modifiable ni supprimable', async () => {
    renderApp('/taxonomy?tab=collections')
    const table = await screen.findByRole('table', { name: 'Collections' })
    await within(table).findByText('Nuxt')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(within(table).getByRole('button', { name: 'Supprimer Sans collection' })).toBeDisabled()
    expect(within(table).getByRole('button', { name: 'Modifier Sans collection' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nouvelle collection' })).toBeInTheDocument()
  })

  it('supprime CI/CD en déplaçant ses contextes vers la cible, avec le tag ci-cd', async () => {
    renderApp('/taxonomy?tab=collections')
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer CI/CD' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer la collection « CI/CD » ?' })
    expect(dialog).toHaveTextContent(
      'Elle contient 4 contextes, dont 3 publiés et lus par les sessions de l’équipe.',
    )
    expect(
      within(dialog).getByRole('combobox', { name: 'Déplacer les contextes vers' }),
    ).toHaveDisplayValue('Sans collection')
    expect(
      within(dialog).getByRole('checkbox', { name: 'Ajouter le tag ci-cd aux contextes déplacés' }),
    ).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Déplacer et supprimer' }))

    const table = screen.getByRole('table', { name: 'Collections' })
    expect(
      await within(table).findByRole('row', { name: /Sans collection.*12/ }),
    ).toBeInTheDocument()
    expect(within(table).queryByText('CI/CD')).not.toBeInTheDocument()
  })

  it('crée une collection', async () => {
    renderApp('/taxonomy?tab=collections')
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle collection' }))
    const dialog = screen.getByRole('dialog', { name: 'Nouvelle collection' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nom' }), 'Sécurité')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer la collection' }))
    expect(await screen.findByRole('row', { name: /Sécurité/ })).toBeInTheDocument()
  })
})

describe('Taxonomie — états', () => {
  it('chargement : squelette et aria-busy, onglets déjà comptés (maquette 19)', async () => {
    renderApp('/taxonomy', { mode: 'loading' })
    expect(await screen.findByRole('table', { name: 'Tags' })).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByRole('tab', { name: 'Tags 34' })).toBeInTheDocument()
  })

  it('vide : explication et CTA (maquette 20)', async () => {
    renderApp('/taxonomy', { mode: 'empty' })
    expect(
      await screen.findByRole('heading', { name: 'Aucun tag pour l’instant' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Créer un contexte' })).toHaveAttribute(
      'href',
      '/contexts/new',
    )
    expect(await screen.findByRole('tab', { name: 'Tags 0' })).toBeInTheDocument()
  })

  it('onglets au clavier, synchronisés dans l’URL', async () => {
    const view = renderApp('/taxonomy')
    await userEvent.click(await screen.findByRole('tab', { name: /Tags/ }))
    await userEvent.keyboard('{ArrowRight}')
    expect(view.location().search).toBe('?tab=collections')
    expect(await screen.findByRole('table', { name: 'Collections' })).toBeInTheDocument()
  })
})
