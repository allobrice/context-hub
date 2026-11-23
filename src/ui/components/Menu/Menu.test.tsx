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
