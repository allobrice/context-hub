import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

import styles from './Tooltip.module.scss'

/** Props à étaler sur l'élément déclencheur, qui doit rester focusable. */
export interface TooltipTriggerProps {
  'aria-describedby': string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  /** Échap masque l'info-bulle sans déplacer le focus (WCAG 1.4.13). */
  onKeyDown: (event: KeyboardEvent) => void
}

export interface TooltipProps {
  content: string
  children: (trigger: TooltipTriggerProps) => ReactNode
}

/**
 * Info-bulle au survol et au focus, masquable par Échap (WCAG 1.4.13).
 * Pour un bouton indisponible, utiliser `aria-disabled` plutôt que `disabled` : un bouton
 * `disabled` ne reçoit ni focus ni survol, et l'info-bulle serait inaccessible.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const show = () => {
    setVisible(true)
  }
  const hide = () => {
    setVisible(false)
  }

  return (
    <span className={styles.tooltip}>
      {children({
        'aria-describedby': id,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        onKeyDown: (event) => {
          if (event.key === 'Escape') hide()
        },
      })}
      <span id={id} role="tooltip" className={styles.bubble} hidden={!visible}>
        {content}
      </span>
    </span>
  )
}
