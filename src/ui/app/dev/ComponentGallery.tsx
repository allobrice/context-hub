import { useState } from 'react'

import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { CopyField } from '../../components/CopyField/CopyField.tsx'
import { Dialog } from '../../components/Dialog/Dialog.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { ErrorState } from '../../components/ErrorState/ErrorState.tsx'
import { Field, Select, TextInput } from '../../components/Field/Field.tsx'
import { fieldHintId } from '../../components/Field/fieldIds.ts'
import { IconButton } from '../../components/IconButton/IconButton.tsx'
import { Menu } from '../../components/Menu/Menu.tsx'
import { Segmented } from '../../components/Segmented/Segmented.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { TabPanel, Tabs } from '../../components/Tabs/Tabs.tsx'
import { Tooltip } from '../../components/Tooltip/Tooltip.tsx'
import { useTheme } from '../theme/themeContext.ts'
import styles from './ComponentGallery.module.scss'

/** Galerie de développement des composants génériques (comparaison visuelle avec les maquettes). */
export function ComponentGallery() {
  const { theme, toggleTheme } = useTheme()
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [scope, setScope] = useState<'personal' | 'project' | 'team'>('team')
  const [tab, setTab] = useState<'tags' | 'collections'>('tags')
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <main className={styles.gallery}>
      <header className={styles.header}>
        <h1 className={styles.title}>Composants génériques</h1>
        <IconButton
          icon="moon"
          label={`Basculer le thème clair / sombre (actuel : ${theme})`}
          onClick={toggleTheme}
        />
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Boutons</h2>
        <div className={styles.row}>
          <Button variant="primary" icon="plus">
            Nouveau contexte
          </Button>
          <Button icon="archive">Archiver</Button>
          <Button variant="primary" icon="pencil">
            Éditer
          </Button>
          <Button variant="primary" disabled>
            Publier la v5
          </Button>
          <Button variant="danger">Supprimer la collection</Button>
          <Button variant="ghost">Annuler</Button>
          <Button size="sm" icon="refresh">
            Réessayer
          </Button>
          <ButtonLink to="/">Connecter Claude Code</ButtonLink>
          <IconButton icon="trash" label="Supprimer conventions" />
          <Menu
            label="Plus d’actions"
            items={[
              { id: 'copy', label: 'Copier l’URI', onSelect: () => undefined },
              { id: 'unarchive', label: 'Désarchiver', disabled: true, onSelect: () => undefined },
            ]}
          />
          <Tooltip content="Disponible dans une prochaine version">
            {(trigger) => (
              <Button size="sm" aria-disabled="true" {...trigger}>
                Comparer…
              </Button>
            )}
          </Tooltip>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Badges et tags</h2>
        <div className={styles.row}>
          <StatusBadge status="published" />
          <StatusBadge status="draft" />
          <StatusBadge status="archived" />
          <Badge>v4</Badge>
          <Badge tone="ok">Courante</Badge>
          <Badge tone="warn">Brouillon</Badge>
          <Tag name="nuxt" />
          <Tag name="conventions" />
          <Tag name="data-fetching" size="lg" />
          <Tag name="nuxt" onRemove={() => undefined} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contrôles</h2>
        <div className={styles.row}>
          <Segmented
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: 'Tableau', icon: 'list' },
              { value: 'cards', label: 'Cartes', icon: 'grid' },
            ]}
          />
          <Segmented
            label="Portée"
            tone="accent"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'personal', label: 'Personnel' },
              { value: 'project', label: 'Projet' },
              { value: 'team', label: 'Équipe' },
            ]}
          />
        </div>
        <div className={styles.grid}>
          <Field
            label="Titre"
            htmlFor="g-title"
            aside="76 / 160"
            hint="Renvoyée par le tool search_contexts."
          >
            <TextInput
              id="g-title"
              defaultValue="Conventions Nuxt 4"
              aria-describedby={fieldHintId('g-title')}
            />
          </Field>
          <Field label="Collection" htmlFor="g-collection">
            <Select id="g-collection" defaultValue="nuxt">
              <option value="nuxt">Nuxt</option>
              <option value="vue">Vue</option>
            </Select>
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Onglets</h2>
        <Tabs
          label="Taxonomie"
          idPrefix="g-tabs"
          selected={tab}
          onSelect={setTab}
          items={[
            { id: 'tags', label: 'Tags', count: 34 },
            { id: 'collections', label: 'Collections', count: 6 },
          ]}
        />
        <TabPanel idPrefix="g-tabs" id={tab}>
          Panneau {tab}
        </TabPanel>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Copie</h2>
        <div className={styles.grid}>
          <CopyField
            value="@context-hub:context://nuxt/conventions-nuxt-4"
            copyLabel="Copier la mention"
          />
          <CopyField
            multiline
            copyLabel="Copier la commande"
            value={
              'claude mcp add --transport http --scope user context-hub https://[HÔTE]/mcp --header "Authorization: Bearer $CONTEXT_HUB_TOKEN"'
            }
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>États</h2>
        <ErrorState
          title="Impossible de charger les contextes"
          code="SQLITE_BUSY · database is locked · req 7f3a91"
          onRetry={() => undefined}
        >
          Le stockage n’a pas répondu. Les sessions Claude Code déjà connectées continuent de servir
          la dernière version en cache.
        </ErrorState>
        <div className={styles.skeletonRow} aria-busy="true" aria-label="Chargement">
          <Skeleton width="70%" height={13} />
          <Skeleton width="90%" height={10} />
        </div>
        <EmptyState
          icon="book"
          title="Aucun contexte pour l’instant"
          actions={
            <>
              <Button variant="primary" icon="plus">
                Créer un contexte
              </Button>
              <Button>Connecter Claude Code</Button>
            </>
          }
        >
          Un contexte est un bloc Markdown réutilisable : conventions, décisions, checklists.
        </EmptyState>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Dialog</h2>
        <div className={styles.row}>
          <Button
            onClick={() => {
              setDialogOpen(true)
            }}
          >
            Ouvrir le dialog de fusion
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false)
          }}
          title="Fusionner 2 tags"
          footer={
            <>
              <Button
                onClick={() => {
                  setDialogOpen(false)
                }}
              >
                Annuler
              </Button>
              <Button variant="primary">Fusionner dans vue</Button>
            </>
          }
        >
          <div className={styles.row}>
            <Tag name="vue3">vue3 · 5</Tag>
            <Tag name="vuejs">vuejs · 2</Tag>
          </div>
        </Dialog>
      </section>
    </main>
  )
}
