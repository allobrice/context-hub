import { describe, expect, it } from 'vitest'

import {
  claimCovers,
  claimsOverlap,
  globToRegExp,
  isClaimExpired,
  normalizeArea,
  normalizeRepoPath,
  staticPrefix,
} from './claims.ts'

const FRONT = 'allovoisins/front'
const zone = (area: string, repo = FRONT) => ({ repo, area })

describe('normalizeArea', () => {
  it.each([
    ['apps/web/src/auth/**', 'apps/web/src/auth/**'],
    ['./apps/web/', 'apps/web/**'],
    ['  apps/web/src/auth/useSession.ts ', 'apps/web/src/auth/useSession.ts'],
    ['pages/[id].vue', 'pages/[id].vue'],
    ['**', '**'],
  ])('%s → %s', (raw, area) => {
    expect(normalizeArea(raw)).toEqual({ area })
  })

  it.each([
    ['', 'empty'],
    ['./', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['C:\\repo\\x', 'absolute'],
    ['apps/../secrets/**', 'dot-segment'],
    ['apps/./web', 'dot-segment'],
    ['apps//web', 'forbidden-character'],
    ['apps/web\n**', 'forbidden-character'],
    ['a'.repeat(301), 'too-long'],
  ])('refuse %j (%s)', (raw, violation) => {
    expect(normalizeArea(raw)).toEqual({ violation })
  })
})

describe('normalizeRepoPath', () => {
  it('retire « ./ » et accepte les crochets littéraux', () => {
    expect(normalizeRepoPath('./apps/web/a.ts')).toBe('apps/web/a.ts')
    expect(normalizeRepoPath('pages/[id].vue')).toBe('pages/[id].vue')
  })

  it.each(['', '/abs/a.ts', '../a.ts', 'a/../../b', 'a//b', 'a\\b', 'a\nb'])(
    'refuse %j',
    (path) => {
      expect(normalizeRepoPath(path)).toBeNull()
    },
  )
})

describe('staticPrefix', () => {
  it.each([
    ['apps/web/src/auth/**', 'apps/web/src/auth/'],
    ['apps/web/*.ts', 'apps/web/'],
    ['apps/we?/x', 'apps/we'],
    ['**/x.ts', ''],
    ['apps/web/a.ts', 'apps/web/a.ts'],
  ])('%s → %j', (area, prefix) => {
    expect(staticPrefix(area)).toBe(prefix)
  })
})

describe('claimCovers', () => {
  it.each([
    ['apps/web/src/auth/**', 'apps/web/src/auth/useSession.ts', true],
    ['apps/web/src/auth/**', 'apps/web/src/auth/deep/nested/x.ts', true],
    ['apps/web/src/auth/**', 'apps/web/src/authz/x.ts', false],
    ['apps/web/src/auth/**', 'apps/web/src/auth', false],
    ['apps/web/*.ts', 'apps/web/a.ts', true],
    ['apps/web/*.ts', 'apps/web/sub/a.ts', false],
    ['apps/**/x.ts', 'apps/x.ts', true],
    ['apps/**/x.ts', 'apps/a/b/x.ts', true],
    ['apps/**/x.ts', 'apps/a/b/y.ts', false],
    ['**/*.vue', 'pages/index.vue', true],
    ['**', 'n/importe/quoi', true],
    ['a?.ts', 'ab.ts', true],
    ['a?.ts', 'a/.ts', false],
    ['pages/[id].vue', 'pages/[id].vue', true],
    ['pages/[id].vue', 'pages/i.vue', false],
    ['src/a.b+c(d)$.ts', 'src/a.b+c(d)$.ts', true],
    ['src/a.ts', 'src/aXts', false],
    ['apps/web/a.ts', './apps/web/a.ts', true],
    ['apps/**', 'apps/../secrets', false],
  ])('%s couvre %s : %s', (area, path, expected) => {
    expect(claimCovers(zone(area), FRONT, path)).toBe(expected)
  })

  it('ne couvre jamais un autre repo', () => {
    expect(claimCovers(zone('**'), 'allovoisins/api', 'a.ts')).toBe(false)
  })
})

describe('claimsOverlap', () => {
  it.each([
    ['apps/web/src/auth/**', 'apps/web/src/auth/useSession.ts', true],
    ['apps/web/src/auth/**', 'apps/web/**', true],
    ['apps/web/src/auth/**', 'apps/web/src/search/**', false],
    ['apps/web/src/auth/**', 'apps/web/src/authz/**', false],
    ['**/*.ts', 'apps/web/src/auth/**', true],
    ['apps/web/*.ts', 'apps/web/src/**', true], // faux positif accepté (préfixe « apps/web/ »)
    ['apps/web', 'apps/web2/x', true], // faux positif accepté
    ['apps/web/a.ts', 'apps/web/b.ts', false],
  ])('%s / %s : %s', (a, b, expected) => {
    expect(claimsOverlap(zone(a), zone(b))).toBe(expected)
    expect(claimsOverlap(zone(b), zone(a))).toBe(expected)
  })

  it('deux repos différents ne se chevauchent jamais', () => {
    expect(claimsOverlap(zone('**'), zone('**', 'allovoisins/api'))).toBe(false)
  })
})

/**
 * Propriété « jamais de faux négatif » : si un fichier est couvert par deux zones, elles se
 * chevauchent. Vérifiée exhaustivement sur toutes les zones et tous les chemins d'un petit alphabet.
 */
describe('claimsOverlap : aucun faux négatif', () => {
  const segments = ['a', 'b', 'ab', 'a.ts', '*', '**', '?', 'a*', '*.ts', 'a?']
  const pathSegments = ['a', 'b', 'ab', 'a.ts', 'b.ts', 'aa']

  function combinations(alphabet: readonly string[], maxDepth: number): string[] {
    let level = alphabet.map((segment) => [segment])
    const all = [...level]
    for (let depth = 2; depth <= maxDepth; depth += 1) {
      level = level.flatMap((prefix) => alphabet.map((segment) => [...prefix, segment]))
      all.push(...level)
    }
    return all.map((parts) => parts.join('/'))
  }

  const areas = combinations(segments, 3)
  const paths = combinations(pathSegments, 3)
  const covered = new Map(
    areas.map((area) => [area, paths.filter((path) => globToRegExp(area).test(path))]),
  )

  it(`sur ${areas.length} zones × ${paths.length} chemins`, () => {
    const falseNegatives: string[] = []
    for (const a of areas) {
      const coveredByA = new Set(covered.get(a))
      for (const b of areas) {
        if (claimsOverlap(zone(a), zone(b))) continue
        const shared = (covered.get(b) ?? []).find((path) => coveredByA.has(path))
        if (shared !== undefined) falseNegatives.push(`${a} / ${b} : ${shared}`)
      }
    }
    expect(falseNegatives).toEqual([])
  })
})

describe('isClaimExpired', () => {
  const now = new Date('2026-11-23T10:00:00.000Z')
  it('expiré à l’échéance exacte, pas avant', () => {
    expect(isClaimExpired({ expiresAt: '2026-11-23T10:00:00.000Z' }, now)).toBe(true)
    expect(isClaimExpired({ expiresAt: '2026-11-23T10:00:01.000Z' }, now)).toBe(false)
  })
})
