import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { installTestPolyfills } from './polyfills.ts'

// Les tests d'architecture tournent en environnement node (sans DOM).
const hasDom = typeof window !== 'undefined'

if (hasDom) installTestPolyfills()

// Les écrans sont des routes lazy : sous une suite parallèle chargée, le premier import dynamique
// d'un fichier de test peut dépasser le délai par défaut (1 s) des findBy / waitFor.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  vi.useRealTimers()
  if (!hasDom) return
  cleanup()
  localStorage.clear()
})
