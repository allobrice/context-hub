import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ThemeContext } from './themeContext.ts'
import {
  readStoredTheme,
  storeTheme,
  systemTheme,
  watchSystemTheme,
  type Theme,
} from './themeStorage.ts'

/**
 * Thème sur `<html data-theme>` (SPEC §3) : choix persisté s'il existe, sinon `prefers-color-scheme`,
 * suivi en direct tant que l'utilisateur n'a rien choisi.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [explicit, setExplicit] = useState<Theme | null>(readStoredTheme)
  const [system, setSystem] = useState<Theme>(systemTheme)
  const theme = explicit ?? system

  useEffect(() => (explicit === null ? watchSystemTheme(setSystem) : undefined), [explicit])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    storeTheme(next)
    setExplicit(next)
  }, [theme])

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext value={value}>{children}</ThemeContext>
}
