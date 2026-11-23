import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { installTestPolyfills } from './polyfills.ts'

// Les tests d'architecture tournent en environnement node (sans DOM).
const hasDom = typeof window !== 'undefined'

if (hasDom) installTestPolyfills()

afterEach(() => {
  vi.useRealTimers()
  if (!hasDom) return
  cleanup()
  localStorage.clear()
})
