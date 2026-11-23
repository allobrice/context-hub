import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorState } from './ErrorState.tsx'

describe('ErrorState', () => {
  it('annonce l’erreur, affiche le code et propose de réessayer', async () => {
    const onRetry = vi.fn()
    render(
      <ErrorState title="Impossible de charger les contextes" code="SQLITE_BUSY" onRetry={onRetry}>
        Le stockage n’a pas répondu.
      </ErrorState>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger les contextes')
    expect(screen.getByText('SQLITE_BUSY').tagName).toBe('CODE')
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
