import { cx } from '../../lib/cx.ts'
import styles from './Button.module.scss'

export type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm'

export interface ButtonLook {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  className?: string | undefined
}

/** Classes partagées par <Button> et <ButtonLink> : un lien peut avoir l'apparence d'un bouton. */
export function buttonClassName({
  variant = 'secondary',
  size = 'md',
  className,
}: ButtonLook): string {
  return cx(
    styles.button,
    variant !== 'secondary' && styles[variant],
    size === 'sm' && styles.sm,
    className,
  )
}

export const BUTTON_ICON_SIZE: Readonly<Record<ButtonSize, number>> = { md: 16, sm: 14 }
