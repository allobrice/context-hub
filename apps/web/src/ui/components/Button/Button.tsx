import type { ComponentPropsWithRef } from 'react'

import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import { BUTTON_ICON_SIZE, buttonClassName, type ButtonLook } from './buttonClassName.ts'

export interface ButtonProps extends ComponentPropsWithRef<'button'>, ButtonLook {
  icon?: IconName | undefined
}

/** Bouton natif ; `type="button"` par défaut pour ne jamais soumettre un formulaire par accident. */
export function Button({
  variant,
  size = 'md',
  icon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClassName({ variant, size, className })} {...rest}>
      {icon && <Icon name={icon} size={BUTTON_ICON_SIZE[size]} />}
      {children}
    </button>
  )
}
