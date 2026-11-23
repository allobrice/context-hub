import type { ComponentPropsWithRef } from 'react'

import { cx } from '../../lib/cx.ts'
import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import styles from './IconButton.module.scss'

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'aria-label'
> {
  icon: IconName
  /** Nom accessible obligatoire : un bouton icône n'a pas de texte visible. */
  label: string
  iconSize?: number
}

export function IconButton({
  icon,
  label,
  iconSize = 16,
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx(styles.iconButton, className)}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
}
