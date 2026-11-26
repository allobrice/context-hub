/**
 * Bail à durée de vie : une réservation (claim de workspace, prise de mission) tenue jusqu'à
 * `expiresAt`, prolongée par l'activité de la session. Chaque fonctionnalité fixe sa propre durée.
 */

export interface Lease {
  readonly acquiredAt: string
  readonly expiresAt: string
}

const MINUTE_MS = 60 * 1000

/** Échéance d'un bail pris (ou prolongé) à `at` pour `minutes`, en ISO 8601 UTC. */
export function leaseUntil(at: Date, minutes: number): string {
  return new Date(at.getTime() + minutes * MINUTE_MS).toISOString()
}

/** Un bail échu n'est plus opposable, même avant sa purge. */
export function isLeaseExpired(lease: Pick<Lease, 'expiresAt'>, now: Date): boolean {
  return Date.parse(lease.expiresAt) <= now.getTime()
}
