import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Menu } from './Menu.tsx'

function setup() {
  const copy = vi.fn()
  render(
    <Menu
      label="Plus d’actions"
      items={[
        { id: 'copy', label: 'Copier l’URI', onSelect: copy },
        { id: 'off', label: 'Indisponible', disabled: true, onSelect: vi.fn() },
        { id: 'unarchive', label: 'Désarchiver', onSelect: vi.fn() },
      ]}
    />,
  )
  return { copy, trigger: screen.getByRole('button', { name: 'Plus d’actions' }) }
}

describe('Menu', () => {
  it('s’ouvre et place le focus sur le premier élément', async () => {
    const { trigger } = setup()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Copier l’URI' })).toHaveFocus()
  })

  it('saute les éléments désactivés aux flèches et boucle', async () => {
    const { trigger } = setup()
    await userEvent.click(trigger)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Désarchiver' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Copier l’URI' })).toHaveFocus()
  })

  it('exécute l’action, se ferme et rend le focus', async () => {
    const { trigger, copy } = setup()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Enter}')
    expect(copy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('se ferme sur Échap', async () => {
    const { trigger } = setup()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('Menu de sélection', () => {
  it('multiple : menuitemcheckbox, reste ouvert et reflète l’état coché', async () => {
    const onSelect = vi.fn()
    render(
      <Menu
        label="Filtrer par tag"
        selection="multiple"
        trigger="Tags"
        items={[
          { id: 'vue', label: 'vue', checked: true, onSelect },
          { id: 'nuxt', label: 'nuxt', checked: false, onSelect },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Tags' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'vue' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'vue' })).toHaveFocus()
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'nuxt' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('single : menuitemradio, se ferme après le choix', async () => {
    render(
      <Menu
        label="Filtrer par portée"
        selection="single"
        trigger="Portée"
        items={[{ id: 'team', label: 'Équipe', onSelect: vi.fn() }]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Portée' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Équipe' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
