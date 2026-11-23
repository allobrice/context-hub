import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from './StatusBadge.tsx'

describe('StatusBadge', () => {
  it.each([
    ['published', 'Publié', 'ok'],
    ['draft', 'Brouillon', 'warn'],
    ['archived', 'Archivé', 'neutral'],
  ] as const)(
    '%s : libellé « %s », ton %s et point (jamais la couleur seule)',
    (status, label, tone) => {
      const { container } = render(<StatusBadge status={status} />)
      expect(screen.getByText(label)).toHaveClass('badge', tone)
      expect(container.querySelector('.dot')).toHaveAttribute('aria-hidden', 'true')
    },
  )
})
