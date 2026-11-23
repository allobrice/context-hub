import { useId } from 'react'

import {
  DESCRIPTION_MAX_LENGTH,
  SCOPE_KINDS,
  type ScopeKind,
} from '@context-hub/domain/context/types.ts'
import type { Collection, Tag } from '@context-hub/domain/taxonomy/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'
import { Field, Select, TextInput } from '../../components/Field/Field.tsx'
import { fieldHintId } from '../../components/Field/fieldIds.ts'
import { Segmented } from '../../components/Segmented/Segmented.tsx'
import { cx } from '../../lib/cx.ts'
import { SCOPE_LABELS } from '../../lib/labels.ts'
import styles from './Editor.module.scss'
import type { EditorAction, EditorState } from './editorForm.ts'
import { TagCombobox } from './TagCombobox.tsx'

const NEW_COLLECTION = '__new__'

const SCOPE_HELP: Readonly<Record<ScopeKind, string>> = {
  personal: 'Visible par vous seul, dans toutes vos sessions.',
  project: 'Servi aux sessions ouvertes dans ce repo.',
  team: 'Servi à toute l’équipe AlloVoisins : publication vérifiée par le scan.',
}

export interface MetadataFieldsProps {
  state: EditorState
  dispatch: (action: EditorAction) => void
  slugEditable: boolean
  slugError: string | null
  collections: readonly Collection[]
  tags: readonly Tag[]
  onNewCollection: () => void
}

/** Métadonnées du contexte (maquette 12) : titre, identifiant, description, collection, portée, tags. */
export function MetadataFields({
  state,
  dispatch,
  slugEditable,
  slugError,
  collections,
  tags,
  onNewCollection,
}: MetadataFieldsProps) {
  const ids = {
    title: useId(),
    slug: useId(),
    description: useId(),
    collection: useId(),
    repo: useId(),
    tags: useId(),
    scopeHelp: useId(),
  }
  const { values } = state
  const descriptionLength = values.description.length
  const collectionValue = !state.collectionTouched
    ? ''
    : (values.collectionId ?? UNCATEGORIZED_COLLECTION_ID)
  const userCollections = collections.filter((collection) => !collection.system)

  return (
    <section className={styles.metadata} aria-label="Métadonnées">
      <Field label="Titre" htmlFor={ids.title}>
        <TextInput
          id={ids.title}
          value={values.title}
          placeholder="Ex. Conventions Nuxt 4 — data fetching"
          required
          onChange={(event) => {
            dispatch({ type: 'title', title: event.target.value })
          }}
        />
      </Field>

      <Field
        label="Identifiant (URI MCP)"
        htmlFor={ids.slug}
        hint={
          slugEditable
            ? 'Généré depuis le titre, modifiable avant la première publication.'
            : 'Figé depuis la v1 : le changer casserait les mentions existantes.'
        }
      >
        <div className={styles.slugField}>
          <span className={styles.slugPrefix} aria-hidden="true">
            context://
          </span>
          <input
            id={ids.slug}
            className={styles.slugInput}
            value={values.slug}
            placeholder="collection/nom-du-contexte"
            readOnly={!slugEditable}
            aria-invalid={slugError !== null}
            aria-describedby={cx(fieldHintId(ids.slug), slugError && `${ids.slug}-error`)}
            spellCheck={false}
            onChange={(event) => {
              dispatch({ type: 'slug', slug: event.target.value })
            }}
          />
        </div>
        {slugError && (
          <span id={`${ids.slug}-error`} className={styles.fieldError}>
            {slugError}
          </span>
        )}
      </Field>

      <Field
        label="Description courte"
        htmlFor={ids.description}
        className={styles.full}
        aside={`${descriptionLength} / ${DESCRIPTION_MAX_LENGTH}`}
        hint={
          <>
            Renvoyée par le tool <span className={styles.mono}>search_contexts</span> : c’est elle
            qui aide Claude à choisir le bon contexte.
          </>
        }
      >
        <TextInput
          id={ids.description}
          value={values.description}
          placeholder="Une phrase : quand une session doit-elle lire ce contexte ?"
          aria-invalid={descriptionLength > DESCRIPTION_MAX_LENGTH}
          aria-describedby={fieldHintId(ids.description)}
          onChange={(event) => {
            dispatch({ type: 'description', value: event.target.value })
          }}
        />
      </Field>

      <Field label="Collection" htmlFor={ids.collection}>
        <Select
          id={ids.collection}
          value={collectionValue}
          onChange={(event) => {
            const { value } = event.target
            if (value === NEW_COLLECTION) onNewCollection()
            else
              dispatch({
                type: 'collection',
                collectionId: value === UNCATEGORIZED_COLLECTION_ID ? null : value,
              })
          }}
        >
          {!state.collectionTouched && (
            <option value="" disabled>
              Choisir une collection…
            </option>
          )}
          {userCollections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
          <option value={UNCATEGORIZED_COLLECTION_ID}>Sans collection</option>
          <option value={NEW_COLLECTION}>+ Nouvelle collection…</option>
        </Select>
      </Field>

      <fieldset className={styles.fieldset} aria-describedby={ids.scopeHelp}>
        <legend className={styles.legend}>Portée</legend>
        <div className={styles.scopeRow}>
          <Segmented<ScopeKind>
            label="Portée"
            tone="accent"
            value={values.scope.kind}
            onChange={(kind) => {
              dispatch({ type: 'scope', kind })
            }}
            options={SCOPE_KINDS.map((kind) => ({ value: kind, label: SCOPE_LABELS[kind] }))}
          />
          {values.scope.kind === 'project' && (
            <>
              <label htmlFor={ids.repo} className="visually-hidden">
                Repo du projet
              </label>
              <input
                id={ids.repo}
                className={styles.repoInput}
                value={values.scope.repo}
                placeholder="allovoisins/front"
                required
                spellCheck={false}
                onChange={(event) => {
                  dispatch({ type: 'repo', repo: event.target.value })
                }}
              />
            </>
          )}
        </div>
        <span id={ids.scopeHelp} className={styles.help}>
          {SCOPE_HELP[values.scope.kind]}
        </span>
      </fieldset>

      <Field label="Tags" htmlFor={ids.tags} className={styles.full}>
        <TagCombobox
          id={ids.tags}
          tags={tags}
          value={values.tags}
          onAdd={(tag) => {
            dispatch({ type: 'add-tag', tag })
          }}
          onRemove={(tag) => {
            dispatch({ type: 'remove-tag', tag })
          }}
        />
      </Field>
    </section>
  )
}
