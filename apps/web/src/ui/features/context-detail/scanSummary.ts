import type { ScanFinding } from '@context-hub/domain/context/scan.ts'
import type { IconName } from '../../components/Icon/icons.ts'

export interface ScanSummary {
  readonly tone: 'ok' | 'warn' | 'danger'
  readonly icon: IconName
  readonly label: string
}

/** Résultat du scan affiché dans l'en-tête du Détail : « Aucun secret détecté (scan v4) ». */
export function scanSummary(findings: readonly ScanFinding[], versionNumber: number): ScanSummary {
  const secrets = findings.filter((finding) => finding.kind === 'secret').length
  const suspicious = findings.length - secrets
  const scope = `(scan v${versionNumber})`
  if (secrets > 0) {
    const label =
      secrets === 1 ? '1 secret potentiel détecté' : `${secrets} secrets potentiels détectés`
    return { tone: 'danger', icon: 'shieldAlert', label: `${label} ${scope}` }
  }
  if (suspicious > 0) {
    const label =
      suspicious === 1 ? '1 instruction suspecte' : `${suspicious} instructions suspectes`
    return { tone: 'warn', icon: 'shieldAlert', label: `${label} ${scope}` }
  }
  return { tone: 'ok', icon: 'shieldCheck', label: `Aucun secret détecté ${scope}` }
}
