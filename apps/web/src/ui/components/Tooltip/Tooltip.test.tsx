import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Tooltip } from './Tooltip.tsx'

describe('Tooltip', () => {
  it('décrit un bouton indisponible au focus et se masque sur Échap', async () => {
    render(
      <Tooltip content="Disponible dans une prochaine version">
        {(trigger) => (
          <button type="button" aria-disabled="true" {...trigger}>
            Comparer…
          </button>
        )}
      </Tooltip>,
    )
    const button = screen.getByRole('button', { name: 'Comparer…' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.tab()
    expect(button).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Disponible dans une prochaine version')
    expect(button).toHaveAccessibleDescription('Disponible dans une prochaine version')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
