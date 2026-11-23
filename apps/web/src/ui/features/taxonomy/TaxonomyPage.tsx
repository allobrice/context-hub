import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { useWorkspaceOverview } from '../../app/queries.ts'
import { Button } from '../../components/Button/Button.tsx'
import { TabPanel, Tabs } from '../../components/Tabs/Tabs.tsx'
import { CollectionsTab } from './CollectionsTab.tsx'
import styles from './Taxonomy.module.scss'
import { TagsTab } from './TagsTab.tsx'

type TaxonomyTab = 'tags' | 'collections'

const ID_PREFIX = 'taxonomy'

/** Tags & collections (SPEC §5.4, maquettes 16–22). L'onglet est dans l'URL : `?tab=tags|collections`. */
export function TaxonomyPage() {
  const [params, setParams] = useSearchParams()
  const tab: TaxonomyTab = params.get('tab') === 'collections' ? 'collections' : 'tags'
  const overview = useWorkspaceOverview().data
  const [creatingCollection, setCreatingCollection] = useState(false)

  return (
    <>
      <title>Tags & collections · Context Hub</title>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Tags &amp; collections</h1>
          <span className={styles.subtitle}>
            Renommer ou fusionner met à jour tous les contextes. Les URI des contextes ne changent
            pas.
          </span>
        </div>
        {tab === 'collections' && (
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              setCreatingCollection(true)
            }}
          >
            Nouvelle collection
          </Button>
        )}
      </header>
      <Tabs<TaxonomyTab>
        label="Taxonomie"
        idPrefix={ID_PREFIX}
        className={styles.tabs}
        selected={tab}
        onSelect={(next) => {
          setParams(
            (current) => {
              const nextParams = new URLSearchParams(current)
              nextParams.set('tab', next)
              return nextParams
            },
            { replace: true },
          )
        }}
        items={[
          { id: 'tags', label: 'Tags', ...(overview ? { count: overview.tagNames.length } : {}) },
          {
            id: 'collections',
            label: 'Collections',
            ...(overview ? { count: overview.collections.length } : {}),
          },
        ]}
      />
      <TabPanel idPrefix={ID_PREFIX} id={tab} className={styles.panel}>
        {tab === 'tags' ? (
          <TagsTab tagNames={overview?.tagNames ?? []} />
        ) : (
          <CollectionsTab creating={creatingCollection} onCreatingChange={setCreatingCollection} />
        )}
      </TabPanel>
    </>
  )
}
