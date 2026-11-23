/** Horloge injectable : `mcpReads7d`, les dates d'écriture et les tests restent déterministes. */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }
