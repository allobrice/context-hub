import { useEffect, useId, useMemo, useReducer, useState } from 'react'
import { useNavigate } from 'react-router'

import { isRepositoryUnavailable } from '../../../application/errors.ts'
import type {
  ContextDetail,
  SaveDraftCommand,
} from '../../../application/ports/ContextRepository.ts'
import {
  draftRejections,
  publishRejections,
  remainingFindings,
  shortTitle,
} from '../../../domain/context/editing.ts'
import { nextDraftNumber } from '../../../domain/context/lifecycle.ts'
import { scanContent, findingKey, type ScanFinding } from '../../../domain/context/scan.ts'
import { DraftRejectedError, VersionConflictError } from '../../../domain/shared/errors.ts'
import type { Collection, Tag } from '../../../domain/taxonomy/types.ts'
import { paths } from '../../app/paths.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { Button } from '../../components/Button/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { TextInput } from '../../components/Field/Field.tsx'
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.ts'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.ts'
import { formatRelativeDate } from '../../lib/format.ts'
import styles from './Editor.module.scss'
import { EditorAlert } from './EditorAlert.tsx'
import { DiffDialog, FalsePositiveDialog, NewCollectionDialog } from './EditorDialogs.tsx'
import { differsFrom, editorReducer, isDirty, type EditorState } from './editorForm.ts'
import { EditorHeader } from './EditorHeader.tsx'
import {
  describeRejections,
  rejectionLabel,
  saveStatusLabel,
  SLUG_REJECTIONS,
} from './editorMessages.ts'
import { MarkdownEditor } from './MarkdownEditor.tsx'
import { MetadataFields } from './MetadataFields.tsx'
import { ScanPanel } from './ScanPanel.tsx'
import { useCreateCollection, useSaveContext } from './useEditorPersistence.ts'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard.ts'

/** Délais (SPEC §5.3 et décisions phase 0). */
const AUTOSAVE_DELAY_MS = 2000
const SCAN_DELAY_MS = 300

export interface ContextEditorProps {
  /** null : création (maquette 14). */
  detail: ContextDetail | null
  initialState: EditorState
  collections: readonly Collection[]
  tags: readonly Tag[]
  currentUser: string
}

/** Création / édition d'un contexte (SPEC §5.3, maquettes 12–15). */
export function ContextEditor({
  detail,
  initialState,
  collections,
  tags,
  currentUser,
}: ContextEditorProps) {
  const { drafts, clock } = useServices()
  const navigate = useNavigate()
  const ids = { editor: useId(), scan: useId(), note: useId() }
  const context = detail?.context ?? null
  const slugEditable = !context?.publishedVersion
  const storageKey = context?.id ?? 'new'
  const now = clock.now()

  const reducer = useMemo(
    () =>
      editorReducer({
        slugEditable,
        currentUser,
        collectionName: (id) =>
          collections.find((collection) => collection.id === id)?.name ?? null,
      }),
    [slugEditable, currentUser, collections],
  )
  const [state, dispatch] = useReducer(reducer, initialState)
  const { values } = state
  const dirty = isDirty(state)

  const save = useSaveContext()
  const createCollection = useCreateCollection()
  const { blocker, allowNextNavigation } = useUnsavedChangesGuard(dirty && !save.isPending)

  const [conflict, setConflict] = useState<VersionConflictError | null>(null)
  const [beforeRebase, setBeforeRebase] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [localCopy, setLocalCopy] = useState(() => {
    const local = drafts.load(storageKey)
    return local && differsFrom(local, initialState) ? local : null
  })
  const [localSavedAt, setLocalSavedAt] = useState<string | null>(null)
  const [falsePositiveFor, setFalsePositiveFor] = useState<ScanFinding | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [newCollectionOpen, setNewCollectionOpen] = useState(false)

  // ── Copie locale (autosave 2 s, décision phase 0) ──────────────────────────
  function saveLocalCopy() {
    const savedAt = clock.now().toISOString()
    const { values: draft, falsePositives, baseVersion } = state
    drafts.save(storageKey, { draft, falsePositives, baseVersion, savedAt })
    setLocalSavedAt(savedAt)
  }
  const autosave = useDebouncedCallback(saveLocalCopy, AUTOSAVE_DELAY_MS)

  useEffect(() => {
    if (dirty) autosave.run()
  }, [dirty, state.values, state.falsePositives, autosave])

  // ── Scan debouncé ──────────────────────────────────────────────────────────
  const scannedContent = useDebouncedValue(values.content, SCAN_DELAY_MS)
  const findings = useMemo(() => scanContent(scannedContent), [scannedContent])
  const flaggedLines = useMemo(
    () => new Set(remainingFindings(findings, state.falsePositives).map((finding) => finding.line)),
    [findings, state.falsePositives],
  )

  const check = {
    takenSlugs: new Set<string>(),
    frozenSlug: context?.publishedVersion ? context.slug : null,
  }
  const publishBlocked = publishRejections(values, state.falsePositives, check)
  const slugProblem =
    values.slug === ''
      ? undefined
      : draftRejections(values, check).find((r) => SLUG_REJECTIONS.has(r))
  const publishBlockedReason = conflict
    ? 'Résolvez d’abord le conflit de version.'
    : publishBlocked.length > 0
      ? `Publication impossible : ${describeRejections(publishBlocked)}.`
      : null

  const draftNumber = context
    ? Math.max(
        context.draft?.number ?? nextDraftNumber(context, detail?.history ?? []),
        (state.baseVersion ?? 0) + 1,
      )
    : null

  // ── Enregistrer / publier ──────────────────────────────────────────────────
  function submit(publish: boolean) {
    const command: SaveDraftCommand = {
      id: context?.id ?? null,
      baseVersion: state.baseVersion,
      draft: values,
      falsePositives: state.falsePositives,
    }
    setFailure(null)
    save.mutate(
      { command, publish },
      {
        onSuccess: (saved) => {
          autosave.cancel()
          drafts.clear(storageKey)
          setLocalSavedAt(null)
          setBeforeRebase(null)
          dispatch({
            type: 'saved',
            values,
            baseVersion: saved.context.publishedVersion?.number ?? null,
          })
          if (publish || !context) {
            allowNextNavigation()
            void navigate(
              publish ? paths.context(saved.context.id) : paths.editContext(saved.context.id),
              {
                replace: !publish,
              },
            )
          }
        },
        onError: (error) => {
          if (error instanceof VersionConflictError) {
            autosave.cancel()
            saveLocalCopy()
            setConflict(error)
          } else if (error instanceof DraftRejectedError) {
            setFailure(`Enregistrement refusé : ${describeRejections(error.reasons)}.`)
          } else {
            setFailure(
              isRepositoryUnavailable(error)
                ? `Le stockage n’a pas répondu (${error.summary}). Votre brouillon est conservé localement.`
                : 'L’enregistrement a échoué. Votre brouillon est conservé localement.',
            )
          }
        },
      },
    )
  }

  function rebase() {
    if (!conflict?.latest) return
    setBeforeRebase(values.content)
    dispatch({
      type: 'rebase',
      content: conflict.latest.content,
      baseVersion: conflict.latestVersion,
    })
    setConflict(null)
  }

  const saveStatus = saveStatusLabel({
    pending: save.isPending,
    conflict: conflict !== null,
    isNew: context === null,
    dirty,
    savedLocally: localSavedAt !== null,
    draftSavedAt: context?.draft?.createdAt ?? null,
    now,
  })

  const cancelPath = context ? paths.context(context.id) : paths.library

  return (
    <>
      <title>{`${context ? 'Modifier le contexte' : 'Nouveau contexte'} · Context Hub`}</title>
      <EditorHeader
        contextTitle={context ? shortTitle(context.title) : null}
        draftNumber={draftNumber}
        saveStatus={saveStatus}
        cancelPath={cancelPath}
        saving={save.isPending}
        publishBlockedReason={publishBlockedReason}
        onSave={() => {
          submit(false)
        }}
        onPublish={() => {
          submit(true)
        }}
      />

      <div className={styles.body}>
        {conflict && (
          <EditorAlert
            tone="danger"
            icon="alertTriangle"
            title="Enregistrement refusé : conflit de version"
            actions={
              conflict.latest && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDiffOpen(true)
                    }}
                  >
                    Voir les différences
                  </Button>
                  <Button size="sm" onClick={rebase}>
                    Repartir de la v{conflict.latestVersion}
                  </Button>
                </>
              )
            }
          >
            {conflict.latest
              ? `${conflict.latest.author} a publié la v${conflict.latestVersion} ${formatRelativeDate(conflict.latest.createdAt, now)} pendant votre édition.`
              : `La v${conflict.latestVersion} a été publiée pendant votre édition.`}{' '}
            Votre brouillon est conservé localement, rien n’est perdu.
          </EditorAlert>
        )}

        {beforeRebase !== null && (
          <EditorAlert
            tone="info"
            icon="refresh"
            actions={
              <Button
                size="sm"
                onClick={() => {
                  dispatch({ type: 'content', value: beforeRebase })
                  setBeforeRebase(null)
                }}
              >
                Revenir à mon contenu
              </Button>
            }
          >
            Contenu remplacé par la v{state.baseVersion}. Votre version précédente reste disponible
            tant que vous n’enregistrez pas.
          </EditorAlert>
        )}

        {localCopy && (
          <EditorAlert
            tone="info"
            icon="clock"
            actions={
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    dispatch({ type: 'restore-local', local: localCopy })
                    setLocalCopy(null)
                  }}
                >
                  Restaurer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    drafts.clear(storageKey)
                    setLocalCopy(null)
                  }}
                >
                  Ignorer
                </Button>
              </>
            }
          >
            Une copie locale non enregistrée de ce brouillon existe (
            {formatRelativeDate(localCopy.savedAt, now)}).
          </EditorAlert>
        )}

        {failure && (
          <EditorAlert tone="danger" icon="alertTriangle">
            {failure}
          </EditorAlert>
        )}

        <MetadataFields
          state={state}
          dispatch={dispatch}
          slugEditable={slugEditable}
          slugError={slugProblem ? rejectionLabel(slugProblem) : null}
          collections={collections}
          tags={tags}
          onNewCollection={() => {
            setNewCollectionOpen(true)
          }}
        />

        <MarkdownEditor
          id={ids.editor}
          value={values.content}
          flaggedLines={flaggedLines}
          describedBy={ids.scan}
          onChange={(value) => {
            dispatch({ type: 'content', value })
          }}
        />

        <section className={styles.footer} aria-label="Vérifications avant publication">
          <ScanPanel
            id={ids.scan}
            content={scannedContent}
            findings={findings}
            falsePositives={state.falsePositives}
            onReplace={(content) => {
              dispatch({ type: 'content', value: content })
            }}
            onFalsePositive={setFalsePositiveFor}
          />
          <div className={styles.note}>
            <label htmlFor={ids.note} className={styles.noteLabel}>
              Note de version <span className={styles.noteHint}>(requise pour publier)</span>
            </label>
            <TextInput
              id={ids.note}
              value={values.versionNote}
              placeholder="Ce qui change pour les sessions qui lisent ce contexte"
              onChange={(event) => {
                dispatch({ type: 'versionNote', value: event.target.value })
              }}
            />
          </div>
        </section>
      </div>

      <FalsePositiveDialog
        finding={falsePositiveFor}
        onCancel={() => {
          setFalsePositiveFor(null)
        }}
        onConfirm={(reason) => {
          if (falsePositiveFor) {
            dispatch({
              type: 'false-positive',
              falsePositive: { findingKey: findingKey(falsePositiveFor), reason },
            })
          }
          setFalsePositiveFor(null)
        }}
      />

      <DiffDialog
        open={diffOpen && conflict?.latest !== undefined}
        title={`Différences avec la v${conflict?.latestVersion ?? ''} publiée`}
        before={conflict?.latest?.content ?? ''}
        after={values.content}
        onClose={() => {
          setDiffOpen(false)
        }}
      />

      <NewCollectionDialog
        open={newCollectionOpen}
        pending={createCollection.isPending}
        onCancel={() => {
          setNewCollectionOpen(false)
        }}
        onCreate={(input) => {
          createCollection.mutate(input, {
            onSuccess: (collection) => {
              dispatch({ type: 'collection', collectionId: collection.id })
              setNewCollectionOpen(false)
            },
          })
        }}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Quitter sans enregistrer ?"
        confirmLabel="Quitter"
        tone="danger"
        onConfirm={() => {
          blocker.proceed?.()
        }}
        onCancel={() => {
          blocker.reset?.()
        }}
      >
        <p>
          Vos modifications ne sont pas enregistrées sur le serveur. Une copie locale reste dans ce
          navigateur : vous pourrez la restaurer en revenant sur ce brouillon.
        </p>
      </ConfirmDialog>
    </>
  )
}
