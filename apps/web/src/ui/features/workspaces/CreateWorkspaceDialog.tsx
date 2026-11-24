import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { slugify } from '@context-hub/domain/context/slug.ts'
import { DEFAULT_LIBRARY_CRITERIA } from '@context-hub/domain/library/criteria.ts'
import { REPO_PATTERN, WORKSPACE_SLUG_PATTERN } from '@context-hub/domain/workspaces/types.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { Field, TextInput } from '../../components/Field/Field.tsx'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.ts'
import { failureOf } from '../../lib/errors.ts'
import { useCreateWorkspace } from './useWorkspaces.ts'
import styles from './Workspace.module.scss'

export interface CreateWorkspaceDialogProps {
  open: boolean
  onCancel: () => void
  onCreated: (slug: string) => void
}

/** Repos saisis séparés par des virgules ou des espaces : `allovoisins/front, allovoisins/api`. */
function parseRepos(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).filter((repo) => repo !== ''))]
}

const MAX_SUGGESTIONS = 8

/** « Nouveau workspace » (SPEC §7.3) : titre, slug, objectif, repos, contextes liés. */
export function CreateWorkspaceDialog({ open, onCancel, onCreated }: CreateWorkspaceDialogProps) {
  const create = useCreateWorkspace()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [goal, setGoal] = useState('')
  const [repos, setRepos] = useState('')
  const [linked, setLinked] = useState<ReadonlyMap<string, string>>(new Map())
  const ids = { title: useId(), slug: useId(), goal: useId(), repos: useId(), search: useId() }

  const effectiveSlug = slugTouched ? slug : slugify(title).slice(0, 60)
  const repoList = parseRepos(repos)
  const invalidRepos = repoList.filter((repo) => !REPO_PATTERN.test(repo))
  const slugValid = WORKSPACE_SLUG_PATTERN.test(effectiveSlug)

  const reset = () => {
    setTitle('')
    setSlug('')
    setSlugTouched(false)
    setGoal('')
    setRepos('')
    setLinked(new Map())
    create.reset()
  }

  return (
    <ConfirmDialog
      open={open}
      title="Nouveau workspace"
      confirmLabel="Créer le workspace"
      pending={create.isPending}
      error={failureOf(create.error)}
      confirmDisabled={title.trim() === '' || !slugValid || invalidRepos.length > 0}
      onConfirm={() => {
        create.mutate(
          {
            title,
            slug: effectiveSlug,
            goal,
            repos: repoList,
            linkedContextIds: [...linked.keys()],
          },
          {
            onSuccess: (detail) => {
              reset()
              onCreated(detail.workspace.slug)
            },
          },
        )
      }}
      onCancel={() => {
        reset()
        onCancel()
      }}
    >
      <Field label="Titre" htmlFor={ids.title}>
        <TextInput
          id={ids.title}
          value={title}
          required
          maxLength={120}
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
      </Field>
      <Field
        label="Slug"
        htmlFor={ids.slug}
        hint={
          slugValid || effectiveSlug === ''
            ? `Commande des sessions : /context-hub:join ${effectiveSlug || '<slug>'}`
            : 'Minuscules, chiffres et tirets uniquement.'
        }
      >
        <TextInput
          id={ids.slug}
          mono
          value={effectiveSlug}
          maxLength={60}
          aria-invalid={!slugValid && effectiveSlug !== ''}
          onChange={(event) => {
            setSlugTouched(true)
            setSlug(event.target.value)
          }}
        />
      </Field>
      <Field label="Objectif" htmlFor={ids.goal}>
        <textarea
          id={ids.goal}
          className={styles.textarea}
          rows={2}
          maxLength={500}
          value={goal}
          onChange={(event) => {
            setGoal(event.target.value)
          }}
        />
      </Field>
      <Field
        label="Repos"
        htmlFor={ids.repos}
        hint={
          invalidRepos.length > 0
            ? `Format attendu owner/name : ${invalidRepos.join(', ')}`
            : 'Séparés par des virgules, ex. allovoisins/front, allovoisins/api'
        }
      >
        <TextInput
          id={ids.repos}
          mono
          value={repos}
          aria-invalid={invalidRepos.length > 0}
          onChange={(event) => {
            setRepos(event.target.value)
          }}
        />
      </Field>
      <LinkedContextPicker
        inputId={ids.search}
        selected={linked}
        onToggle={(id, label) => {
          setLinked((current) => {
            const next = new Map(current)
            if (next.has(id)) next.delete(id)
            else next.set(id, label)
            return next
          })
        }}
      />
    </ConfirmDialog>
  )
}

/** Contextes liés : recherche parmi les contextes PUBLIÉS (seuls inclus dans le résumé des sessions). */
function LinkedContextPicker({
  inputId,
  selected,
  onToggle,
}: {
  inputId: string
  selected: ReadonlyMap<string, string>
  onToggle: (id: string, label: string) => void
}) {
  const { contexts } = useServices()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search.trim(), 250)
  const results = useQuery({
    queryKey: ['contexts', 'linkable', query],
    queryFn: () => contexts.search({ ...DEFAULT_LIBRARY_CRITERIA, query, status: 'published' }),
    enabled: query !== '',
  })
  const suggestions = results.data?.page.items.slice(0, MAX_SUGGESTIONS) ?? []
  const selectedOnly = [...selected].filter(([id]) => !suggestions.some((c) => c.id === id))

  return (
    <Field
      label="Contextes liés"
      htmlFor={inputId}
      hint="Contextes publiés inclus dans le résumé injecté aux sessions."
    >
      <TextInput
        id={inputId}
        type="search"
        placeholder="Rechercher un contexte publié…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
        }}
      />
      {(suggestions.length > 0 || selectedOnly.length > 0) && (
        <ul className={styles.pickList} aria-label="Contextes publiés">
          {[
            ...selectedOnly.map(([id, label]) => ({ id, label })),
            ...suggestions.map((context) => ({ id: context.id, label: context.title })),
          ].map(({ id, label }) => (
            <li key={id}>
              <label className={styles.pickItem}>
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => {
                    onToggle(id, label)
                  }}
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}
