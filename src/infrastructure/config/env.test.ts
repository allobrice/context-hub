import { describe, expect, it } from 'vitest'

import { readAppConfig } from './env.ts'

const env = (host: string): ImportMetaEnv => ({ ...import.meta.env, VITE_MCP_HOST: host })

describe('readAppConfig', () => {
  it('lit VITE_MCP_HOST, ou null s’il est absent ou vide', () => {
    expect(readAppConfig(env(' hub.example.com '))).toEqual({ mcpHost: 'hub.example.com' })
    expect(readAppConfig(env(''))).toEqual({ mcpHost: null })
  })
})
