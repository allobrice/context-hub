export interface Tag {
  readonly name: string
  readonly contextCount: number
  readonly publishedCount: number
  readonly lastUsedAt: string | null
}

export interface Collection {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly contextCount: number
  readonly publishedCount: number
  readonly system?: true
}

/** Identifiant de la collection système « Sans collection » (contextes dont collectionId est null). */
export const UNCATEGORIZED_COLLECTION_ID = 'none'
