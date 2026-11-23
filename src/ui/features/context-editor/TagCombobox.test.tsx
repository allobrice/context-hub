import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { Tag } from '../../../domain/taxonomy/types.ts'
import { TagCombobox } from './TagCombobox.tsx'

const tag = (name: string, contextCount: number): Tag => ({
  name,
  contextCount,
  publishedCount: 0,
  lastUsedAt: null,
})
const REGISTRY = [
  tag('data-fetching', 6),
  tag('database', 2),
  tag('data-viz', 1),
  tag('nuxt', 9),
  tag('conventions', 11),
]

function Harness() {
  const [value, setValue] = useState<string[]>(['nuxt', 'conventions'])
  return (
    <>
      <label htmlFor="tags">Tags</label>
      <TagCombobox
        id="tags"
        tags={REGISTRY}
        value={value}
        onAdd={(name) => {
          setValue((current) => [...current, name])
        }}
        onRemove={(name) => {
          setValue((current) => current.filter((t) => t !== name))
        }}
      />
      <output>{value.join(',')}</output>
    </>
  )
}

describe('TagCombobox (maquette 12)', () => {
  it('suggère avec compteurs et propose la création', async () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Tags' })
    await userEvent.type(input, 'data')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'data-fetching6 contextes',
      'database2 contextes',
      'data-viz1 contexte',
      'Créer le tag « data »',
    ])
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id)
  })

  it('↑↓ puis Entrée ajoute le tag actif ; Échap ferme', async () => {
    render(<Harness />)
    const input = screen.getByRole('combobox', { name: 'Tags' })
    await userEvent.type(input, 'data{ArrowDown}{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('nuxt,conventions,database')
    expect(input).toHaveValue('')

    await userEvent.type(input, 'da')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('crée un nouveau tag', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'hydratation{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('nuxt,conventions,hydratation')
  })

  it('retire un tag par sa croix ou par Retour arrière', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le tag nuxt' }))
    expect(screen.getByRole('status')).toHaveTextContent('conventions')
    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), '{Backspace}')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
