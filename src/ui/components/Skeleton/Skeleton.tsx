import type { CSSProperties } from 'react'

import { cx } from '../../lib/cx.ts'
import styles from './Skeleton.module.scss'

export interface SkeletonProps {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  className?: string | undefined
}

/**
 * Bloc de chargement décoratif. Le conteneur qui charge porte `aria-busy="true"`
 * et un libellé : le skeleton lui-même est masqué aux technologies d'assistance.
 */
export function Skeleton({ width = '100%', height = 12, className }: SkeletonProps) {
  return (
    <span aria-hidden="true" className={cx(styles.skeleton, className)} style={{ width, height }} />
  )
}
