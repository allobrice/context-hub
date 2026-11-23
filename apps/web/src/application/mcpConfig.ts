import { MCP_SERVER_NAME } from '@context-hub/domain/context/uri.ts'

/** Placeholder affiché tant que `VITE_MCP_URL` n'est pas défini (SPEC §5.2). */
export const MCP_HOST_PLACEHOLDER = '[HÔTE]'
const PLACEHOLDER_URL = `https://${MCP_HOST_PLACEHOLDER}/mcp`

/** Le jeton n'est jamais lu par l'UI : la configuration référence la variable d'environnement. */
export const TOKEN_ENV_VAR = 'CONTEXT_HUB_TOKEN'

export type McpConfigFormat = 'cli' | 'mcp-json'

function serverUrl(url: string | null): string {
  return url ?? PLACEHOLDER_URL
}

/** Commande `claude mcp add` (scope user), découpée sur plusieurs lignes comme dans la maquette 08. */
export function cliConfig(url: string | null): string {
  return [
    'claude mcp add --transport http --scope user \\',
    `  ${MCP_SERVER_NAME} ${serverUrl(url)} \\`,
    `  --header "Authorization: Bearer $${TOKEN_ENV_VAR}"`,
  ].join('\n')
}

/** Fichier `.mcp.json` (scope project, versionné) : le jeton est interpolé depuis l'environnement. */
export function mcpJsonConfig(url: string | null): string {
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'http',
        url: serverUrl(url),
        headers: { Authorization: `Bearer \${${TOKEN_ENV_VAR}}` },
      },
    },
  }
  return JSON.stringify(config, null, 2)
}

export function mcpConfig(format: McpConfigFormat, url: string | null): string {
  return format === 'cli' ? cliConfig(url) : mcpJsonConfig(url)
}
