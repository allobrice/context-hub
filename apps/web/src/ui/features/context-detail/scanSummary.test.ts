import { describe, expect, it } from 'vitest'

import type { ScanFinding } from '@context-hub/domain/context/scan.ts'
import { scanSummary } from './scanSummary.ts'

const secret: ScanFinding = { kind: 'secret', line: 1, pattern: 'sk_live_', label: 'clé d’API' }
const suspicious: ScanFinding = { kind: 'suspicious-instruction', line: 2, excerpt: 'x' }

describe('scanSummary', () => {
  it('rassure quand rien n’est détecté (maquette 08)', () => {
    expect(scanSummary([], 4)).toEqual({
      tone: 'ok',
      icon: 'shieldCheck',
      label: 'Aucun secret détecté (scan v4)',
    })
  })

  it('priorise les secrets sur les instructions suspectes', () => {
    expect(scanSummary([secret, suspicious, secret], 5)).toMatchObject({
      tone: 'danger',
      label: '2 secrets potentiels détectés (scan v5)',
    })
  })

  it('signale les instructions suspectes', () => {
    expect(scanSummary([suspicious], 2)).toMatchObject({
      tone: 'warn',
      label: '1 instruction suspecte (scan v2)',
    })
  })
})
