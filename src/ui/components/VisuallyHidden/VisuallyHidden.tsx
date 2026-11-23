import type { ReactNode } from 'react'

/** Texte lu par les technologies d'assistance, invisible à l'écran. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="visually-hidden">{children}</span>
}
