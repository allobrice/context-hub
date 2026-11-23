import { describe, expect, it } from 'vitest'

import {
  ContextNotFoundError,
  isDomainError,
  TaxonomyRuleError,
  VersionConflictError,
} from './errors.ts'

describe('erreurs du domaine', () => {
  it('portent un code discriminant et restent des Error', () => {
    const errors = [
      new ContextNotFoundError('nuxt/x'),
      new VersionConflictError(4, 5),
      new TaxonomyRuleError('unknown-tag'),
    ]
    expect(errors.map((e) => e.code)).toEqual([
      'CONTEXT_NOT_FOUND',
      'VERSION_CONFLICT',
      'TAXONOMY_RULE',
    ])
    expect(errors.every((e) => e instanceof Error && isDomainError(e))).toBe(true)
  })

  it('isDomainError rejette les erreurs quelconques', () => {
    expect(isDomainError(new Error('x'))).toBe(false)
    expect(isDomainError('x')).toBe(false)
  })
})
