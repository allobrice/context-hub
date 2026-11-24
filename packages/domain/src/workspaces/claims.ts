/**
 * Zones réservées (claims) : globs relatifs à la racine d'un repo (SPEC §7.2).
 *
 * Jokers : `*` (dans un segment), `?` (un caractère), `**` (zéro ou plusieurs segments). Tout autre
 * caractère est LITTÉRAL : `[id]`, `{a,b}` ou `!` ne sont ni des classes, ni des alternatives, ni des
 * négations (routes Nuxt `pages/[id].vue`). La règle de chevauchement reste ainsi démontrable.
 */
import type { Claim } from './types.ts'

export const AREA_MAX_LENGTH = 300

/** Caractères de contrôle (dont le retour à la ligne) : jamais dans un chemin. */
function hasControlCharacter(value: string): boolean {
  for (const char of value) if (char.charCodeAt(0) < 0x20 || char === '\u007f') return true
  return false
}

export type AreaViolation =
  'empty' | 'too-long' | 'absolute' | 'forbidden-character' | 'dot-segment'

function hasDotSegment(path: string): boolean {
  return path.split('/').some((segment) => segment === '..' || segment === '.')
}

/**
 * Normalise une zone : « ./ » de tête retiré, et un dossier terminé par « / » couvre tout son contenu
 * (`apps/web/` → `apps/web/**`). Renvoie la violation si la zone est invalide.
 */
export function normalizeArea(raw: string): { area: string } | { violation: AreaViolation } {
  let area = raw.trim()
  while (area.startsWith('./')) area = area.slice(2)
  if (area.endsWith('/')) area = `${area}**`
  if (area === '') return { violation: 'empty' }
  if (area.length > AREA_MAX_LENGTH) return { violation: 'too-long' }
  if (area.startsWith('/') || area.includes('\\')) return { violation: 'absolute' }
  if (hasControlCharacter(area) || area.includes('//')) return { violation: 'forbidden-character' }
  if (hasDotSegment(area)) return { violation: 'dot-segment' }
  return { area }
}

/**
 * Chemin de fichier relatif à la racine du repo, normalisé (« ./ » de tête retiré) ; null s'il est
 * vide, absolu, remonte (`..`) ou contient un caractère de contrôle.
 */
export function normalizeRepoPath(raw: string): string | null {
  let path = raw.trim()
  while (path.startsWith('./')) path = path.slice(2)
  if (path === '' || path.length > AREA_MAX_LENGTH) return null
  if (path.startsWith('/') || path.includes('\\') || path.includes('//')) return null
  if (hasControlCharacter(path) || hasDotSegment(path)) return null
  return path
}

/** Partie littérale d'une zone, avant le premier joker : tout fichier couvert commence par elle. */
export function staticPrefix(area: string): string {
  const wildcard = area.search(/[*?]/)
  return wildcard === -1 ? area : area.slice(0, wildcard)
}

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g

/** Glob → expression régulière ancrée. */
export function globToRegExp(area: string): RegExp {
  let pattern = ''
  let index = 0
  while (index < area.length) {
    if (area.startsWith('**/', index)) {
      pattern += '(?:.*/)?'
      index += 3
    } else if (area.startsWith('**', index)) {
      pattern += '.*'
      index += 2
    } else {
      const char = area.charAt(index)
      if (char === '*') pattern += '[^/]*'
      else if (char === '?') pattern += '[^/]'
      else pattern += char.replace(REGEX_SPECIAL, '\\$&')
      index += 1
    }
  }
  return new RegExp(`^${pattern}$`)
}

type ClaimZone = Pick<Claim, 'repo' | 'area'>

/** Le claim couvre-t-il ce fichier (chemin relatif au repo) ? Utilisé par le hook PreToolUse. */
export function claimCovers(claim: ClaimZone, repo: string, path: string): boolean {
  if (claim.repo !== repo) return false
  const normalized = normalizeRepoPath(path)
  return normalized !== null && globToRegExp(claim.area).test(normalized)
}

/**
 * Deux claims se chevauchent si un fichier peut correspondre aux deux globs. Règle v1 conservatrice :
 * même repo, et le préfixe statique de l'un est un préfixe de l'autre. Sans faux négatif : un fichier
 * couvert par les deux commence par les deux préfixes, donc l'un prolonge l'autre. Les faux positifs
 * (`apps/web` contre `apps/web2/x`) sont acceptés.
 */
export function claimsOverlap(a: ClaimZone, b: ClaimZone): boolean {
  if (a.repo !== b.repo) return false
  const prefixA = staticPrefix(a.area)
  const prefixB = staticPrefix(b.area)
  return prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)
}

/** Un claim expiré n'est plus opposable. */
export function isClaimExpired(claim: Pick<Claim, 'expiresAt'>, now: Date): boolean {
  return Date.parse(claim.expiresAt) <= now.getTime()
}

/** Même session : même utilisateur et même label (deux sessions d'un même repo restent distinctes). */
export function isSameSession(
  a: { readonly userId: string; readonly sessionLabel: string },
  b: { readonly userId: string; readonly sessionLabel: string },
): boolean {
  return a.userId === b.userId && a.sessionLabel === b.sessionLabel
}
