import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button.tsx'
import { ButtonLink } from './ButtonLink.tsx'

describe('Button', () => {
  it('est un vrai bouton de type "button" par défaut', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Archiver</Button>)
    const button = screen.getByRole('button', { name: 'Archiver' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applique variante et taille', () => {
    render(
      <Button variant="primary" size="sm" icon="plus">
        Nouveau
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveClass('button', 'primary', 'sm')
  })

  it('ne déclenche rien une fois désactivé', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Publier
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ButtonLink', () => {
  it('est un vrai lien avec href', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/contexts/new" variant="primary">
          Nouveau contexte
        </ButtonLink>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Nouveau contexte' })).toHaveAttribute(
      'href',
      '/contexts/new',
    )
  })
})
