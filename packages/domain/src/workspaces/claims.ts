/**
 * Zones réservées (claims) : globs relatifs à la racine d'un repo (SPEC §7.2).
 *
 * Jokers : `*` (dans un segment), `?` (un caractère), `**` (zéro ou plusieurs segments). Tout autre
 * caractère est LITTÉRAL : `[id]`, `{a,b}` ou `!` ne sont ni des classes, ni des alternatives, ni des
 * négations (routes Nuxt `pages/[id].vue`). La règle de chevauchement reste ainsi démontrable.
 */
import { isLeaseExpired } from '../sessions/lease.ts'
import {
  hasControlCharacter,
  hasDotSegment,
  normalizeRepoPath,
  REPO_PATH_MAX_LENGTH,
} from '../shared/repo.ts'

import type { Claim } from './types.ts'

export const AREA_MAX_LENGTH = REPO_PATH_MAX_LENGTH

export type AreaViolation =
  'empty' | 'too-long' | 'absolute' | 'forbidden-character' | 'dot-segment'

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
  return isLeaseExpired(claim, now)
}
