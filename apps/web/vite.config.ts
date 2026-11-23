import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      // Permet `@use 'abstracts' as *;` depuis n'importe quel module SCSS.
      scss: { loadPaths: [fileURLToPath(new URL('./src/ui/styles', import.meta.url))] },
    },
  },
  server: {
    // design-kit/ est une référence en lecture seule : jamais servi ni importé par l'app.
    // `deny` remplace la liste par défaut de Vite : on la reprend explicitement.
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/design-kit/**'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
    // Dates des fixtures et formats relatifs calculés en heure de Paris, comme les maquettes.
    env: { TZ: 'Europe/Paris' },
  },
})
