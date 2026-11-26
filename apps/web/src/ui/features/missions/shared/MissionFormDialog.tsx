import { useId, useState } from 'react'

import {
  PROMPT_SECTION_TITLES,
  promptTemplateSkeleton,
  validatePromptTemplate,
} from '@context-hub/domain/missions/template.ts'
import {
  MISSION_PROMPT_MAX_LENGTH,
  PRIORITIES,
  type Mission,
  type Priority,
} from '@context-hub/domain/missions/types.ts'

import type { MissionScopeInput } from '../../../../application/ports/MissionRepository.ts'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog.tsx'
import { Field, Select, TextInput } from '../../../components/Field/Field.tsx'
import { failureOf } from '../../../lib/errors.ts'
import styles from './MissionShared.module.scss'
import { useCreateMission, useUpdateMission } from './useMissions.ts'

/** Équipe par défaut de la démo (portée équipe). */
const DEFAULT_TEAM = 'allovoisins'

function isPriority(value: string): value is Priority {
  return PRIORITIES.some((priority) => priority === value)
}

type ScopeKind = MissionScopeInput['kind']

function isScopeKind(value: string): value is ScopeKind {
  return value === 'personal' || value === 'team' || value === 'project'
}

/** Liste saisie séparée par des virgules, des espaces ou des retours à la ligne. */
function splitList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).filter((item) => item !== ''))]
}

export type MissionFormMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly mission: Mission }

export interface MissionFormDialogProps {
  open: boolean
  mode: MissionFormMode
  onCancel: () => void
  onSaved: (slug: string) => void
}

/**
 * « Nouvelle mission » (file) et « Modifier » (détail, mission à valider ou prête). Le serveur fait
 * autorité : gabarit, scan et champs sont relus à l'enregistrement (422 détaillé).
 */
export function MissionFormDialog({ open, mode, onCancel, onSaved }: MissionFormDialogProps) {
  const editing = mode.kind === 'edit' ? mode.mission : null
  const create = useCreateMission()
  const update = useUpdateMission(editing?.slug ?? '')
  const mutation = editing === null ? create : update

  const [title, setTitle] = useState(editing?.title ?? '')
  const [summary, setSummary] = useState(editing?.summary ?? '')
  const [prompt, setPrompt] = useState(editing?.prompt ?? promptTemplateSkeleton())
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'P2')
  const [tags, setTags] = useState(editing?.tags.join(', ') ?? '')
  const [scope, setScope] = useState<ScopeKind>('team')
  const [team, setTeam] = useState(DEFAULT_TEAM)
  const [originLabel, setOriginLabel] = useState('')
  const [repo, setRepo] = useState('')
  const [commit, setCommit] = useState('')
  const [files, setFiles] = useState('')
  const id = useId()
  const ids = {
    title: `${id}-title`,
    summary: `${id}-summary`,
    prompt: `${id}-prompt`,
    priority: `${id}-priority`,
    tags: `${id}-tags`,
    scope: `${id}-scope`,
    team: `${id}-team`,
    origin: `${id}-origin`,
    repo: `${id}-repo`,
    commit: `${id}-commit`,
    files: `${id}-files`,
  }

  const template = validatePromptTemplate(prompt)
  const missing = template.ok
    ? []
    : template.missing.map((section) => PROMPT_SECTION_TITLES[section])
  const requiredFilled =
    title.trim() !== '' &&
    summary.trim() !== '' &&
    (editing !== null || (originLabel.trim() !== '' && repo.trim() !== '' && commit.trim() !== ''))

  const save = () => {
    const common = {
      title,
      summary,
      prompt,
      priority,
      tags: splitList(tags.toLowerCase()),
    }
    if (editing !== null) {
      update.mutate(
        { ...common, expectedUpdatedAt: editing.updatedAt },
        {
          onSuccess: (detail) => {
            onSaved(detail.mission.slug)
          },
        },
      )
      return
    }
    create.mutate(
      {
        ...common,
        scope:
          scope === 'team'
            ? { kind: 'team', team }
            : scope === 'project'
              ? { kind: 'project', repo }
              : { kind: 'personal' },
        origin: { label: originLabel, batchId: null },
        codeRef: { repo, commit, files: splitList(files) },
        linkedContextIds: [],
      },
      {
        onSuccess: (detail) => {
          onSaved(detail.mission.slug)
        },
      },
    )
  }

  return (
    <ConfirmDialog
      open={open}
      title={editing === null ? 'Nouvelle mission' : 'Modifier la mission'}
      confirmLabel={editing === null ? 'Créer la mission' : 'Enregistrer'}
      pending={mutation.isPending}
      error={failureOf(mutation.error)}
      confirmDisabled={!requiredFilled || missing.length > 0}
      onConfirm={save}
      onCancel={() => {
        mutation.reset()
        onCancel()
      }}
    >
      <Field label="Titre" htmlFor={ids.title} hint="Un objectif vérifiable, en une ligne.">
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
      <Field label="Résumé" htmlFor={ids.summary} hint="Une ligne, affichée dans la file.">
        <TextInput
          id={ids.summary}
          value={summary}
          required
          maxLength={200}
          onChange={(event) => {
            setSummary(event.target.value)
          }}
        />
      </Field>
      <Field
        label="Prompt"
        htmlFor={ids.prompt}
        aside={`${String(prompt.length)} / ${String(MISSION_PROMPT_MAX_LENGTH)}`}
        hint={
          missing.length > 0
            ? `Sections obligatoires manquantes ou vides : ${missing.join(', ')}.`
            : 'Instruction suivie par une autre session : constat chiffré, daté, avec le commit.'
        }
      >
        <textarea
          id={ids.prompt}
          className={styles.promptInput}
          rows={12}
          value={prompt}
          aria-invalid={missing.length > 0}
          onChange={(event) => {
            setPrompt(event.target.value)
          }}
        />
      </Field>
      <div className={styles.formRow}>
        <Field label="Priorité" htmlFor={ids.priority}>
          <Select
            id={ids.priority}
            value={priority}
            onChange={(event) => {
              if (isPriority(event.target.value)) setPriority(event.target.value)
            }}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor={ids.tags} hint="Séparés par des virgules, ex. perf, lcp">
          <TextInput
            id={ids.tags}
            value={tags}
            onChange={(event) => {
              setTags(event.target.value)
            }}
          />
        </Field>
      </div>
      {editing === null && (
        <>
          <div className={styles.formRow}>
            <Field
              label="Portée"
              htmlFor={ids.scope}
              hint="Une mission créée depuis l’UI est prête directement."
            >
              <Select
                id={ids.scope}
                value={scope}
                onChange={(event) => {
                  if (isScopeKind(event.target.value)) setScope(event.target.value)
                }}
              >
                <option value="team">Équipe</option>
                <option value="project">Projet (repo)</option>
                <option value="personal">Personnelle</option>
              </Select>
            </Field>
            {scope === 'team' && (
              <Field label="Équipe" htmlFor={ids.team}>
                <TextInput
                  id={ids.team}
                  value={team}
                  onChange={(event) => {
                    setTeam(event.target.value)
                  }}
                />
              </Field>
            )}
          </div>
          <Field
            label="Origine"
            htmlFor={ids.origin}
            hint="Ex. « Audit perf · page d’accueil Nuxt »"
          >
            <TextInput
              id={ids.origin}
              value={originLabel}
              maxLength={200}
              onChange={(event) => {
                setOriginLabel(event.target.value)
              }}
            />
          </Field>
          <div className={styles.formRow}>
            <Field label="Repo" htmlFor={ids.repo} hint="owner/name">
              <TextInput
                id={ids.repo}
                mono
                value={repo}
                onChange={(event) => {
                  setRepo(event.target.value)
                }}
              />
            </Field>
            <Field label="Commit" htmlFor={ids.commit} hint="SHA analysé">
              <TextInput
                id={ids.commit}
                mono
                value={commit}
                maxLength={40}
                onChange={(event) => {
                  setCommit(event.target.value)
                }}
              />
            </Field>
          </div>
          <Field
            label="Fichiers"
            htmlFor={ids.files}
            hint="Chemins relatifs au repo, un par ligne."
          >
            <textarea
              id={ids.files}
              className={styles.filesInput}
              rows={3}
              value={files}
              onChange={(event) => {
                setFiles(event.target.value)
              }}
            />
          </Field>
        </>
      )}
    </ConfirmDialog>
  )
}
