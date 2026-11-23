import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Segmented } from './Segmented.tsx'

function Scope() {
  const [value, setValue] = useState<'personal' | 'project' | 'team'>('team')
  return (
    <Segmented
      label="Portée"
      value={value}
      onChange={setValue}
      options={[
        { value: 'personal', label: 'Personnel' },
        { value: 'project', label: 'Projet' },
        { value: 'team', label: 'Équipe' },
      ]}
    />
  )
}

describe('Segmented', () => {
  it('est un radiogroup dont seule l’option choisie est tabulable', () => {
    render(<Scope />)
    expect(screen.getByRole('radiogroup', { name: 'Portée' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Équipe' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Équipe' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Projet' })).toHaveAttribute('tabindex', '-1')
  })

  it('sélectionne au clic', async () => {
    render(<Scope />)
    await userEvent.click(screen.getByRole('radio', { name: 'Projet' }))
    expect(screen.getByRole('radio', { name: 'Projet' })).toBeChecked()
  })

  it('se pilote au clavier, en boucle', async () => {
    render(<Scope />)
    await userEvent.click(screen.getByRole('radio', { name: 'Équipe' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Personnel' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Personnel' })).toBeChecked()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('radio', { name: 'Équipe' })).toBeChecked()
  })
})
