import { describe, expect, it } from 'vitest'

import { readApiBaseUrl, readAppConfig } from './env.ts'

const env = (values: Partial<ImportMetaEnv>): ImportMetaEnv => ({ ...import.meta.env, ...values })

describe('readAppConfig', () => {
  it('lit VITE_MCP_URL (http ou https), ou null s’il est absent, vide ou invalide', () => {
    expect(readAppConfig(env({ VITE_MCP_URL: ' http://127.0.0.1:8787/mcp ' }))).toEqual({
      mcpUrl: 'http://127.0.0.1:8787/mcp',
    })
    expect(readAppConfig(env({ VITE_MCP_URL: '' }))).toEqual({ mcpUrl: null })
    expect(readAppConfig(env({ VITE_MCP_URL: 'javascript:alert(1)' }))).toEqual({ mcpUrl: null })
  })
})

describe('readApiBaseUrl', () => {
  it('retire la barre finale ; vide par défaut (même origine)', () => {
    expect(readApiBaseUrl(env({ VITE_API_BASE_URL: 'http://127.0.0.1:8787/' }))).toBe(
      'http://127.0.0.1:8787',
    )
    expect(readApiBaseUrl(env({}))).toBe('')
  })
})
