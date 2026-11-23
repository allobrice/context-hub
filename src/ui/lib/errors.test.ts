import { describe, expect, it } from 'vitest'

import { RepositoryUnavailableError } from '../../application/errors.ts'
import { ContextNotFoundError, TaxonomyRuleError } from '../../domain/shared/errors.ts'
import { failureMessage, technicalCode } from './errors.ts'

const storage = new RepositoryUnavailableError('SQLITE_BUSY', 'database is locked', '7f3a91')

describe('erreurs affichées', () => {
  it('expose le code technique des erreurs de stockage uniquement', () => {
    expect(technicalCode(storage)).toBe('SQLITE_BUSY · database is locked · req 7f3a91')
    expect(technicalCode(new Error('x'))).toBeUndefined()
  })

  it('traduit les échecs d’opération', () => {
    expect(failureMessage(storage)).toBe(
      'Le stockage n’a pas répondu (SQLITE_BUSY · database is locked · req 7f3a91). Rien n’a été modifié.',
    )
    expect(failureMessage(new TaxonomyRuleError('system-collection-immutable'))).toBe(
      '« Sans collection » ne peut être ni renommée ni supprimée.',
    )
    expect(failureMessage(new ContextNotFoundError('x'))).toBe('Contexte introuvable : x')
    expect(failureMessage('boom')).toBe('L’opération a échoué. Réessayez dans un instant.')
  })
})
