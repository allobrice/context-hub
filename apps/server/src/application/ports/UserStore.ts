import type { User, UserId } from '../viewer.ts'

export interface NewApiToken {
  readonly userId: UserId
  /** sha-256 hexadécimal du jeton : le jeton lui-même n'est jamais stocké. */
  readonly tokenHash: string
  readonly label: string
  readonly at: Date
}

export interface UserStore {
  /** Utilisateur porteur du jeton dont c'est le hash, ou null ; met à jour `last_used_at`. */
  authenticate(tokenHash: string, at: Date): Promise<User | null>
  createToken(token: NewApiToken): Promise<void>
}
