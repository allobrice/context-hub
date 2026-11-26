import { cx } from '../../../lib/cx.ts'
import type { LifecycleStep } from './missionPresentation.ts'
import styles from './MissionShared.module.scss'

/**
 * Frise du cycle de vie (SPEC §8.4) : étapes passées cochées, étape courante en accent. L'état est
 * aussi donné en texte (lecteur d'écran) : la couleur n'est jamais le seul porteur d'information.
 */
export function LifecycleTimeline({ steps }: { steps: readonly LifecycleStep[] }) {
  return (
    <ol className={styles.timeline} aria-label="Cycle de vie de la mission">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={styles.step}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className={styles.stepBody}>
            <span className={cx(styles.stepMark, styles[step.state])} aria-hidden="true">
              {step.state === 'done' ? '✓' : String(index + 1)}
            </span>
            <span className={styles.stepText}>
              <span
                className={cx(
                  styles.stepLabel,
                  step.state === 'current' && styles.stepLabelCurrent,
                )}
              >
                {step.label}
                <span className={styles.visuallyHidden}>
                  {step.state === 'done'
                    ? ' (passée)'
                    : step.state === 'current'
                      ? ' (étape actuelle)'
                      : ''}
                </span>
              </span>
              <span className={styles.stepDetail}>{step.detail}</span>
            </span>
          </span>
          {index < steps.length - 1 && (
            <span
              className={cx(styles.connector, step.state === 'done' && styles.connectorDone)}
              aria-hidden="true"
            />
          )}
        </li>
      ))}
    </ol>
  )
}
