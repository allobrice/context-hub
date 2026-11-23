import type { User, Viewer } from '../../application/viewer.ts'

/** Variables de contexte Hono posées par les middlewares. */
export interface AppEnv {
  Variables: {
    requestId: string
    /** Utilisateur authentifié (middleware Bearer) : absent seulement sur /api/health. */
    user: User
    viewer: Viewer
  }
}
