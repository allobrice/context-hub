import type { ComponentPropsWithRef } from 'react'
import { Link } from 'react-router'

import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import { BUTTON_ICON_SIZE, buttonClassName, type ButtonLook } from './buttonClassName.ts'

export interface ButtonLinkProps extends ComponentPropsWithRef<typeof Link>, ButtonLook {
  icon?: IconName | undefined
}

/** Lien de navigation (vrai <a href>) avec l'apparence d'un bouton. */
export function ButtonLink({
  variant,
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, className })} {...rest}>
      {icon && <Icon name={icon} size={BUTTON_ICON_SIZE[size]} />}
      {children}
    </Link>
  )
}
