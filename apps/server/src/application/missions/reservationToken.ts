/**
 * Jeton de réservation d'une mission : remis à la session qui la prend, exigé pour agir sur elle.
 * Seul son sha-256 est stocké (comme les jetons d'API).
 */
import { createHash, randomBytes } from 'node:crypto'

/** Préfixe repérable (scanners de secrets, journaux). */
export const RESERVATION_TOKEN_PREFIX = 'chmr_'

export function generateReservationToken(): string {
  return `${RESERVATION_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`
}

export function hashReservationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
