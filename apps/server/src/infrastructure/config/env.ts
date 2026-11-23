import { z } from 'zod'

/**
 * Configuration du serveur, lue une fois au démarrage et validée : une valeur invalide arrête le
 * démarrage avec un message clair plutôt qu'un comportement dégradé.
 */
const EnvSchema = z.object({
  /** Écoute locale par défaut (dev) : jamais exposé sur le réseau sans le décider. */
  CONTEXT_HUB_HOST: z.string().min(1).default('127.0.0.1'),
  /** 0 : port libre choisi par le système (tests), lu dans la ligne `server.listening`. */
  CONTEXT_HUB_PORT: z.coerce.number().int().min(0).max(65_535).default(8787),
  /** Seule origine autorisée par CORS : le front. */
  CONTEXT_HUB_WEB_ORIGIN: z.url().default('http://localhost:5173'),
  CONTEXT_HUB_WORKSPACE_NAME: z.string().min(1).default('Espace AlloVoisins'),
  /** Noms d'hôte acceptés dans `Host` sur /mcp, séparés par des virgules (DNS rebinding). */
  CONTEXT_HUB_ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1,[::1]'),
})

export interface ServerConfig {
  readonly host: string
  readonly port: number
  readonly webOrigin: string
  readonly workspaceName: string
  readonly allowedHosts: readonly string[]
}

/** @throws Error listant les variables invalides */
export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`)
    throw new Error(`Configuration invalide\n${issues.join('\n')}`)
  }
  const { data } = parsed
  return {
    host: data.CONTEXT_HUB_HOST,
    port: data.CONTEXT_HUB_PORT,
    webOrigin: new URL(data.CONTEXT_HUB_WEB_ORIGIN).origin,
    workspaceName: data.CONTEXT_HUB_WORKSPACE_NAME,
    allowedHosts: data.CONTEXT_HUB_ALLOWED_HOSTS.split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  }
}
