import { MCP_SERVER_NAME } from '@context-hub/domain/context/uri.ts'

/** Placeholder affiché tant que `VITE_MCP_HOST` n'est pas défini (SPEC §5.2). */
export const MCP_HOST_PLACEHOLDER = '[HÔTE]'

/** Le jeton n'est jamais lu par l'UI : la configuration référence la variable d'environnement. */
export const TOKEN_ENV_VAR = 'CONTEXT_HUB_TOKEN'

export type McpConfigFormat = 'cli' | 'mcp-json'

function serverUrl(host: string | null): string {
  return `https://${host ?? MCP_HOST_PLACEHOLDER}/mcp`
}

/** Commande `claude mcp add` (scope user), découpée sur plusieurs lignes comme dans la maquette 08. */
export function cliConfig(host: string | null): string {
  return [
    'claude mcp add --transport http --scope user \\',
    `  ${MCP_SERVER_NAME} ${serverUrl(host)} \\`,
    `  --header "Authorization: Bearer $${TOKEN_ENV_VAR}"`,
  ].join('\n')
}

/** Fichier `.mcp.json` (scope project, versionné) : le jeton est interpolé depuis l'environnement. */
export function mcpJsonConfig(host: string | null): string {
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'http',
        url: serverUrl(host),
        headers: { Authorization: `Bearer \${${TOKEN_ENV_VAR}}` },
      },
    },
  }
  return JSON.stringify(config, null, 2)
}

export function mcpConfig(format: McpConfigFormat, host: string | null): string {
  return format === 'cli' ? cliConfig(host) : mcpJsonConfig(host)
}
