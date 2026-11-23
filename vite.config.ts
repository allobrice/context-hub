import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
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
  },
})
