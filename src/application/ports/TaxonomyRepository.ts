import type { Collection, Tag } from '../../domain/taxonomy/types.ts'

export interface NewCollection {
  readonly name: string
  readonly description: string
}

export interface TaxonomyRepository {
  /** Tags avec compteurs (contextes, publiés) et dernier usage. */
  listTags(): Promise<readonly Tag[]>
  listCollections(): Promise<readonly Collection[]>
  createCollection(input: NewCollection): Promise<Collection>
}
