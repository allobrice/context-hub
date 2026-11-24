import { useEffect, useState } from 'react'

/** Heure réelle rafraîchie toutes les `intervalMs` : à n'utiliser que dans un petit composant feuille. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => {
      clearInterval(timer)
    }
  }, [intervalMs])
  return now
}
