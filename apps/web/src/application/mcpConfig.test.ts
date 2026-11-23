import { describe, expect, it } from 'vitest'

import { cliConfig, mcpConfig, mcpJsonConfig } from './mcpConfig.ts'

describe('configuration MCP (SPEC §5.2)', () => {
  it('commande CLI en scope user, jeton depuis l’environnement', () => {
    expect(cliConfig(null)).toBe(
      [
        'claude mcp add --transport http --scope user \\',
        '  context-hub https://[HÔTE]/mcp \\',
        '  --header "Authorization: Bearer $CONTEXT_HUB_TOKEN"',
      ].join('\n'),
    )
  })

  it('.mcp.json valide, jeton interpolé, URL configurée', () => {
    const json: unknown = JSON.parse(mcpJsonConfig('https://hub.example.com/mcp'))
    expect(json).toEqual({
      mcpServers: {
        'context-hub': {
          type: 'http',
          url: 'https://hub.example.com/mcp',
          headers: { Authorization: 'Bearer ${CONTEXT_HUB_TOKEN}' },
        },
      },
    })
  })

  it('affiche l’URL réelle du serveur en dev', () => {
    expect(cliConfig('http://127.0.0.1:8787/mcp')).toContain(
      'context-hub http://127.0.0.1:8787/mcp \\',
    )
  })

  it('ne contient jamais de jeton en clair', () => {
    for (const format of ['cli', 'mcp-json'] as const) {
      expect(mcpConfig(format, 'http://127.0.0.1:8787/mcp')).toMatch(/\$\{?CONTEXT_HUB_TOKEN\}?/)
    }
  })
})
