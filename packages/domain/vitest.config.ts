import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    restoreMocks: true,
    // Formats de dates calculés en heure de Paris, comme les maquettes et le front.
    env: { TZ: 'Europe/Paris' },
  },
})
