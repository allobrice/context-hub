import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { IconButton } from './IconButton.tsx'

describe('IconButton', () => {
  it('expose son libellé comme nom accessible et cache l’icône', () => {
    const { container } = render(<IconButton icon="trash" label="Supprimer conventions" />)
    expect(screen.getByRole('button', { name: 'Supprimer conventions' })).toHaveAttribute(
      'title',
      'Supprimer conventions',
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
