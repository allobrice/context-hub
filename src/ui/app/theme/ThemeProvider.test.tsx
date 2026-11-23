import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTheme } from './themeContext.ts'
import { ThemeProvider } from './ThemeProvider.tsx'
import { readStoredTheme, THEME_STORAGE_KEY } from './themeStorage.ts'

function Toggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  )
}

function mockSystemDark(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: dark,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('ThemeProvider', () => {
  it('suit prefers-color-scheme sans choix enregistré', () => {
    mockSystemDark(true)
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('privilégie le choix enregistré', () => {
    mockSystemDark(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('bascule et persiste le choix', async () => {
    mockSystemDark(false)
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('reste fonctionnel si localStorage est indisponible', async () => {
    mockSystemDark(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(readStoredTheme()).toBeNull()
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
