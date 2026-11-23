import type { Clock } from '../../application/ports/Clock.ts'

/**
 * « Maintenant » des données de démo : les maquettes affichent « il y a 2 h » pour une mise à jour
 * du 23 nov. 2026 à 09:12 (Europe/Paris).
 */
export const DEMO_NOW = '2026-11-23T11:12:00+01:00'

export const demoClock: Clock = { now: () => new Date(DEMO_NOW) }
