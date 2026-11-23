/** Horloge injectable : les dates relatives (« il y a 2 h ») et les tests restent déterministes. */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }
