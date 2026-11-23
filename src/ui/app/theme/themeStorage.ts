export type Theme = 'light' | 'dark'

/** Même clé que le script inline d'index.html, qui applique le thème avant le premier rendu. */
export const THEME_STORAGE_KEY = 'context-hub:theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/** Choix explicite de l'utilisateur, ou null. localStorage peut être indisponible : jamais d'exception. */
export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Stockage indisponible (navigation privée, quota) : le choix vaut pour la session seulement.
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? 'dark' : 'light')
  }
  query.addEventListener('change', listener)
  return () => {
    query.removeEventListener('change', listener)
  }
}
