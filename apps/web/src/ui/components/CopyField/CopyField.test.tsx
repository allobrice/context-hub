import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { COPY_FEEDBACK_MS } from '../../hooks/useCopyToClipboard.ts'
import { CopyField } from './CopyField.tsx'

const URI = 'context://nuxt/conventions-nuxt-4'

describe('CopyField', () => {
  it('copie la valeur, affiche « Copié » et l’annonce via aria-live', async () => {
    const user = userEvent.setup()
    render(<CopyField value={URI} copyLabel="Copier l’URI" />)

    await user.click(screen.getByRole('button', { name: 'Copier l’URI' }))

    expect(await navigator.clipboard.readText()).toBe(URI)
    expect(screen.getByRole('button', { name: 'Copier l’URI' })).toHaveTextContent('Copié')
    expect(screen.getByRole('status')).toHaveTextContent('Copié dans le presse-papiers')
  })

  it('revient à « Copier » après 2 s', async () => {
    // Horloge simulée pilotée par le test ; presse-papiers simulé (user-event et faux timers ne cohabitent pas).
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    render(<CopyField value={URI} copyLabel="Copier l’URI" />)

    fireEvent.click(screen.getByRole('button'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole('button')).toHaveTextContent('Copié')

    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1)
    })
    expect(screen.getByRole('button')).toHaveTextContent('Copié')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('button')).toHaveTextContent('Copier')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('annonce l’échec si le presse-papiers refuse', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    render(<CopyField value={URI} copyLabel="Copier l’URI" />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('status')).toHaveTextContent('Copie impossible')
  })
})
