/** Date d'écriture en ISO 8601 UTC : triable lexicographiquement, portable. */
export function isoDate(date: Date): string {
  return date.toISOString()
}

/** Normalise une date ISO quelconque (`+01:00`, `+02:00`…) en UTC. */
export function toUtcIso(value: string): string {
  return new Date(value).toISOString()
}
