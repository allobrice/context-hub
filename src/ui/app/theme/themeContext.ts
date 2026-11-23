import { createContext, useContext } from 'react'

import type { Theme } from './themeStorage.ts'

export interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme doit être utilisé sous <ThemeProvider>')
  return value
}
