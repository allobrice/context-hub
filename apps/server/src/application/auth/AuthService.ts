import type { Clock } from '../ports/Clock.ts'
import type { UserStore } from '../ports/UserStore.ts'
import type { User } from '../viewer.ts'
import { hashApiToken } from './apiToken.ts'

/** Authentifie un jeton Bearer : il est comparé à son hash sha-256 en base, jamais stocké en clair. */
export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly clock: Clock,
  ) {}

  authenticate(token: string): Promise<User | null> {
    return this.users.authenticate(hashApiToken(token), this.clock.now())
  }
}
