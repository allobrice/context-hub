import { createHash, randomBytes } from 'node:crypto'

/** Préfixe des jetons Context Hub : repérable par les scanners de secrets (dont `scanContent`). */
export const API_TOKEN_PREFIX = 'chub_'

const TOKEN_BYTES = 32

/** Nouveau jeton d'API : 256 bits aléatoires, encodés en base64url. À n'afficher qu'une fois. */
export function generateApiToken(): string {
  return `${API_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`
}

/** Hash stocké en base (sha-256 hexadécimal) : le jeton lui-même n'est jamais persisté. */
export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
