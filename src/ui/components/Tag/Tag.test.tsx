import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Tag } from './Tag.tsx'

describe('Tag', () => {
  it('affiche le nom, sans bouton par défaut', () => {
    render(<Tag name="nuxt" />)
    expect(screen.getByText('nuxt')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('devient un chip supprimable', async () => {
    const onRemove = vi.fn()
    render(<Tag name="conventions" onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le tag conventions' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
