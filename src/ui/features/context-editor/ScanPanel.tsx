import { remainingFindings, type FalsePositive } from '../../../domain/context/editing.ts'
import { suggestVariableReplacement, type ScanFinding } from '../../../domain/context/scan.ts'
import { Button } from '../../components/Button/Button.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import styles from './Editor.module.scss'

export interface ScanPanelProps {
  id: string
  content: string
  findings: readonly ScanFinding[]
  falsePositives: readonly FalsePositive[]
  onReplace: (content: string) => void
  onFalsePositive: (finding: ScanFinding) => void
}

function describe(finding: ScanFinding): string {
  return finding.kind === 'secret'
    ? `Ligne ${finding.line} · ${finding.label} (motif ${finding.pattern}).`
    : `Ligne ${finding.line} · « ${finding.excerpt} »`
}

/**
 * Résultat du scan sous l'éditeur (maquettes 12–14). Un secret bloque la publication ;
 * une instruction suspecte est signalée sans bloquer. Le serveur refera le scan.
 */
export function ScanPanel({
  id,
  content,
  findings,
  falsePositives,
  onReplace,
  onFalsePositive,
}: ScanPanelProps) {
  const remaining = remainingFindings(findings, falsePositives)
  const secrets = remaining.filter((finding) => finding.kind === 'secret')
  const ignored =
    falsePositives.length > 0
      ? ` · ${plural(falsePositives.length, 'faux positif déclaré', 'faux positifs déclarés')}`
      : ''

  if (content.trim() === '') {
    return (
      <div id={id} role="status" className={cx(styles.scan, styles.scanIdle)}>
        <Icon name="shield" className={styles.scanIcon} />
        <span>
          Scan de sécurité automatique pendant la saisie : secrets et instructions suspectes.
        </span>
      </div>
    )
  }

  if (remaining.length === 0) {
    return (
      <div id={id} role="status" className={cx(styles.scan, styles.scanOk)}>
        <Icon name="shieldCheck" className={styles.scanIcon} />
        <span>
          <strong>Aucun secret détecté</strong> · aucune instruction suspecte (« ignore previous… »,
          exfiltration d’URL){ignored}
        </span>
      </div>
    )
  }

  const blocking = secrets.length > 0
  const title = blocking
    ? `${secrets.length === 1 ? '1 secret potentiel détecté' : `${secrets.length} secrets potentiels détectés`} : publication bloquée`
    : `${plural(remaining.length, 'instruction suspecte', 'instructions suspectes')} : à vérifier avant publication`

  return (
    <div
      id={id}
      role="alert"
      className={cx(styles.scan, blocking ? styles.scanDanger : styles.scanWarn)}
    >
      <Icon name="shieldAlert" className={styles.scanIcon} />
      <div className={styles.scanBody}>
        <strong>{title}</strong>
        {remaining.map((finding) => {
          const replacement = suggestVariableReplacement(content, finding)
          return (
            <div key={`${finding.kind}-${finding.line}`} className={styles.finding}>
              <span>
                {describe(finding)}
                {finding.kind === 'secret' &&
                  ' Un contexte publié est lu par toutes les sessions de sa portée.'}
              </span>
              <div className={styles.findingActions}>
                {replacement && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onReplace(replacement.content)
                    }}
                  >
                    Remplacer par{' '}
                    <span className={styles.mono}>{`\${${replacement.variable}}`}</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Faux positif ligne ${finding.line}…`}
                  onClick={() => {
                    onFalsePositive(finding)
                  }}
                >
                  Faux positif…
                </Button>
              </div>
            </div>
          )
        })}
        {ignored && <span className={styles.help}>{ignored.slice(3)}</span>}
      </div>
    </div>
  )
}
