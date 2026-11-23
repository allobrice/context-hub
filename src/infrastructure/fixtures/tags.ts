/**
 * Registre des tags (maquette 16) : un tag existe indépendamment des contextes
 * (« legacy-webpack » n'est porté par aucun). `lastUsedAt` est la date de dernière affectation.
 */
export interface TagRecord {
  readonly name: string
  readonly lastUsedAt: string | null
}

export const TAG_FIXTURES: readonly TagRecord[] = [
  { name: 'conventions', lastUsedAt: '2026-11-23T09:12:00+01:00' },
  { name: 'nuxt', lastUsedAt: '2026-11-23T09:12:00+01:00' },
  { name: 'vue', lastUsedAt: '2026-11-22T10:05:00+01:00' },
  { name: 'data-fetching', lastUsedAt: '2026-11-23T09:12:00+01:00' },
  { name: 'review', lastUsedAt: '2026-11-22T15:30:00+01:00' },
  { name: 'vue3', lastUsedAt: '2026-11-17T09:40:00+01:00' },
  { name: 'pinia', lastUsedAt: '2026-11-17T11:00:00+01:00' },
  { name: 'ci', lastUsedAt: '2026-10-02T17:20:00+02:00' },
  { name: 'a11y', lastUsedAt: '2026-11-12T16:00:00+01:00' },
  { name: 'vuejs', lastUsedAt: '2026-10-04T10:00:00+02:00' },
  { name: 'debug', lastUsedAt: '2026-11-08T18:30:00+01:00' },
  { name: 'legacy-webpack', lastUsedAt: null },
  { name: 'migration', lastUsedAt: '2026-11-22T10:05:00+01:00' },
  { name: 'adr', lastUsedAt: '2026-11-22T10:05:00+01:00' },
  { name: 'wording', lastUsedAt: '2026-11-19T14:00:00+01:00' },
  { name: 'i18n', lastUsedAt: '2026-11-19T14:00:00+01:00' },
  { name: 'state', lastUsedAt: '2026-11-17T11:00:00+01:00' },
  { name: 'wcag', lastUsedAt: '2026-11-12T16:00:00+01:00' },
  { name: 'nitro', lastUsedAt: '2026-11-08T18:30:00+01:00' },
  { name: 'github-actions', lastUsedAt: '2026-10-02T17:20:00+02:00' },
  { name: 'qualité', lastUsedAt: '2026-11-22T15:30:00+01:00' },
  { name: 'ssr', lastUsedAt: '2026-09-24T10:00:00+02:00' },
  { name: 'performance', lastUsedAt: '2026-09-28T15:00:00+02:00' },
  { name: 'seo', lastUsedAt: '2026-09-02T11:00:00+02:00' },
  { name: 'typescript', lastUsedAt: '2026-09-29T10:30:00+02:00' },
  { name: 'testing', lastUsedAt: '2026-09-25T16:20:00+02:00' },
  { name: 'vitest', lastUsedAt: '2026-09-25T16:20:00+02:00' },
  { name: 'loco', lastUsedAt: '2026-09-18T09:00:00+02:00' },
  { name: 'design-system', lastUsedAt: '2026-09-15T14:00:00+02:00' },
  { name: 'scss', lastUsedAt: '2026-09-15T14:00:00+02:00' },
  { name: 'security', lastUsedAt: '2026-08-27T10:00:00+02:00' },
  { name: 'gitlab-ci', lastUsedAt: '2026-07-08T11:00:00+02:00' },
  { name: 'docker', lastUsedAt: '2026-07-08T11:00:00+02:00' },
  { name: 'playwright', lastUsedAt: '2026-09-10T17:00:00+02:00' },
]
