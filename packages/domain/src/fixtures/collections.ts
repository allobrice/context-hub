import { UNCATEGORIZED_COLLECTION_ID } from '../taxonomy/types.ts'

/** Collections de démo (maquette 21). Les compteurs sont calculés à partir des contextes. */
export interface CollectionRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly system?: true
}

export const COLLECTION_FIXTURES: readonly CollectionRecord[] = [
  {
    id: 'nuxt',
    name: 'Nuxt',
    description: 'Conventions et patterns Nuxt 4 (app/, Nitro, data fetching)',
  },
  { id: 'vue', name: 'Vue', description: 'Composants, Pinia, migration 2.7 → 3' },
  {
    id: 'conventions-allovoisins',
    name: 'Conventions AlloVoisins',
    description: 'Wording, Loco, règles produit transverses',
  },
  { id: 'review', name: 'Review', description: 'Règles de revue de code et checklists qualité' },
  { id: 'ci-cd', name: 'CI/CD', description: 'Workflows GitHub Actions et GitLab CI' },
  {
    id: UNCATEGORIZED_COLLECTION_ID,
    name: 'Sans collection',
    description: 'Vue système : contextes non classés',
    system: true,
  },
]
