/** Formats d'affichage français (dates relatives, nombres, pluriels) — fonctions pures, horloge injectée. */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Date relative compacte des listes : « à l’instant », « il y a 20 min », « il y a 2 h », « hier »,
 * puis « 19 nov. » (même année) ou « 2 oct. 2025 ».
 */
export function formatRelativeDate(iso: string, now: Date): string {
  const date = new Date(iso)
  const elapsed = now.getTime() - date.getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / (24 * HOUR))
  if (dayDiff === 0 && elapsed >= 0) {
    if (elapsed < MINUTE) return 'à l’instant'
    if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`
    return `il y a ${Math.floor(elapsed / HOUR)} h`
  }
  if (dayDiff === 1) return 'hier'
  return (date.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(date)
}

const thousands = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const integer = new Intl.NumberFormat('fr-FR')

/** Tokens en milliers, une décimale : 2140 → « 2,1k », 600 → « 0,6k ». */
export function formatTokensCompact(tokens: number): string {
  return `${thousands.format(tokens / 1000)}k`
}

/** 2140 → « 2 140 » (espace fine insécable, comme Intl). */
export function formatInteger(value: number): string {
  return integer.format(value)
}

/** Accord français : 0 et 1 au singulier. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count <= 1 ? singular : pluralForm}`
}
