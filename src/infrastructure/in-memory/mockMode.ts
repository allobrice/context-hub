/** États reproduisibles des maquettes via `?mock=` (PROMPT.md). */
export const MOCK_MODES = ['empty', 'loading', 'error', 'slow', 'conflict'] as const
export type MockMode = (typeof MOCK_MODES)[number] | 'normal'

export const MOCK_PARAM = 'mock'

export function parseMockMode(search: string): MockMode {
  const value = new URLSearchParams(search).get(MOCK_PARAM)
  return MOCK_MODES.find((mode) => mode === value) ?? 'normal'
}
