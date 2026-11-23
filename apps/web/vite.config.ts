import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { loadEnv, type ProxyOptions } from 'vite'
import { defineConfig } from 'vitest/config'

/** API Context Hub en dev (apps/server, `pnpm dev`). */
const DEFAULT_API_TARGET = 'http://127.0.0.1:8787'

/**
 * Proxy `/api` vers le serveur. Le jeton de dev est lu dans l'environnement Node (`.env.local`,
 * sans préfixe `VITE_`) et injecté ici : il n'entre jamais dans le bundle ni dans le navigateur.
 */
function apiProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const token = env.CONTEXT_HUB_DEV_TOKEN?.trim() ?? ''
  const target = env.CONTEXT_HUB_API_TARGET?.trim() ?? ''
  return {
    '/api': {
      target: target === '' ? DEFAULT_API_TARGET : target,
      changeOrigin: true,
      // Posé sur la requête sortante (l'option `headers` du proxy n'est pas appliquée par Vite 8).
      configure: (proxy) => {
        if (token === '') return
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('Authorization', `Bearer ${token}`)
        })
      },
    },
  }
}

export default defineConfig(({ mode }) => ({
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
    // '' : charge aussi les variables sans préfixe VITE_ (côté Node uniquement).
    proxy: apiProxy(loadEnv(mode, import.meta.dirname, '')),
  },
  test: {
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
    // Dates des fixtures et formats relatifs calculés en heure de Paris, comme les maquettes.
    env: { TZ: 'Europe/Paris' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
          exclude: ['tests/contract/**'],
        },
      },
      // Contrat HTTP contre un vrai serveur (processus enfants) : lancé APRÈS `unit` (script
      // `test`), pour ne pas disputer le CPU aux tests d'UI et les rendre instables.
      {
        extends: true,
        test: {
          name: 'contract',
          environment: 'node',
          include: ['tests/contract/**/*.test.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
}))
