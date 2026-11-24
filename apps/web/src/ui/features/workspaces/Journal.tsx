import { useId, useState } from 'react'

import { scanContent } from '@context-hub/domain/context/scan.ts'
import {
  ENTRY_MAX_LENGTH,
  type AuthoredEntryKind,
  type WorkspaceDetail,
} from '@context-hub/domain/workspaces/types.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { useWorkspaceOverview } from '../../app/queries.ts'
import { Button } from '../../components/Button/Button.tsx'
import { Select } from '../../components/Field/Field.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import { useNow } from '../../hooks/useNow.ts'
import { cx } from '../../lib/cx.ts'
import { failureOf } from '../../lib/errors.ts'
import { JournalEntryItem } from './JournalEntryItem.tsx'
import { olderRangeLabel } from './journal.ts'
import { useLastSync, usePostEntry, type useJournal } from './useWorkspaces.ts'
import { COMPOSER_KINDS, JOURNAL_FILTERS, type JournalFilter } from './workspacePresentation.ts'
import styles from './Workspace.module.scss'

type JournalHook = ReturnType<typeof useJournal>

const RELATIVE_TIME_REFRESH_MS = 30_000

/** Journal (SPEC §7.4) : filtres par type, indicateur « En direct », composer, entrées, pagination. */
export function Journal({ detail, journal }: { detail: WorkspaceDetail; journal: JournalHook }) {
  const { clock } = useServices()
  const [filter, setFilter] = useState<JournalFilter>('all')
  const open = detail.workspace.status === 'open'
  const data = journal.journal.data
  const entries = data?.entries.filter((entry) => filter === 'all' || entry.kind === filter) ?? []
  const older = data ? olderRangeLabel(data) : null
  const headingId = useId()
  // Heures relatives (« il y a 40 s ») : un rendu du journal toutes les 30 s, pas à chaque polling.
  useNow(RELATIVE_TIME_REFRESH_MS)
  const now = clock.now()

  return (
    <section aria-labelledby={headingId} className={styles.journal}>
      <div className={styles.journalBar}>
        <h2 id={headingId} className={styles.sectionTitle}>
          Journal
        </h2>
        <div role="group" aria-label="Filtrer par type" className={styles.chips}>
          {JOURNAL_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={cx(styles.chip, filter === value && styles.chipOn)}
              onClick={() => {
                setFilter(value)
              }}
            >
              {label}{' '}
              <span className={styles.chipCount}>
                {value === 'all' ? detail.entryCount : detail.entryCounts[value]}
              </span>
            </button>
          ))}
        </div>
        {open ? (
          <LiveIndicator slug={detail.workspace.slug} failed={journal.syncFailed} />
        ) : (
          <span className={styles.live}>Archivé</span>
        )}
      </div>

      {open && <Composer slug={detail.workspace.slug} />}

      {journal.journal.isPending && <JournalSkeleton />}
      {journal.journal.isError && (
        <p role="alert" className={styles.inlineError}>
          {failureOf(journal.journal.error)}
        </p>
      )}
      {data && (
        <>
          {entries.length === 0 ? (
            <p className={styles.muted}>
              {filter === 'all'
                ? 'Aucune entrée pour l’instant.'
                : 'Aucune entrée de ce type parmi les entrées chargées.'}
            </p>
          ) : (
            <ol
              aria-label="Entrées du journal, de la plus récente à la plus ancienne"
              className={styles.entries}
            >
              {entries.map((entry) => (
                <JournalEntryItem
                  key={entry.seq}
                  entry={entry}
                  workspace={detail.workspace}
                  now={now}
                />
              ))}
            </ol>
          )}
          {older !== null && (
            <Button
              size="sm"
              className={styles.loadOlder}
              disabled={journal.loadOlder.isPending}
              onClick={() => {
                journal.loadOlder.mutate()
              }}
            >
              Charger les entrées précédentes ({older})
            </Button>
          )}
        </>
      )}
    </section>
  )
}

/** « En direct · mis à jour il y a N s » : seul ce composant se re-rend chaque seconde. */
function LiveIndicator({ slug, failed }: { slug: string; failed: boolean }) {
  const now = useNow(1000)
  const lastSyncAt = useLastSync(slug)
  const seconds = lastSyncAt === 0 ? 0 : Math.max(0, Math.floor((now - lastSyncAt) / 1000))
  return (
    <span role="status" className={styles.live}>
      <span className={cx(styles.dot, failed ? styles.dotWarn : styles.dotOk)} aria-hidden="true" />
      {failed
        ? 'Synchronisation interrompue · nouvel essai automatique'
        : `En direct · mis à jour il y a ${seconds} s`}
    </span>
  )
}

/** Message humain, publié comme `<utilisateur> · ui` ; le serveur le scanne (secrets masqués). */
function Composer({ slug }: { slug: string }) {
  const post = usePostEntry(slug)
  const userName = useWorkspaceOverview().data?.currentUser.name ?? ''
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<AuthoredEntryKind>('note')
  const ids = { body: useId(), kind: useId() }
  const hasSecret = scanContent(body).some((finding) => finding.kind === 'secret')

  return (
    <form
      aria-label="Publier dans le journal"
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        post.mutate(
          { kind, body },
          {
            onSuccess: () => {
              setBody('')
            },
          },
        )
      }}
    >
      <label htmlFor={ids.body} className={styles.visuallyHidden}>
        Message
      </label>
      <textarea
        id={ids.body}
        className={styles.textarea}
        rows={2}
        maxLength={ENTRY_MAX_LENGTH}
        placeholder="Ajouter une note, une décision ou une question pour les sessions…"
        value={body}
        onChange={(event) => {
          setBody(event.target.value)
        }}
      />
      <div className={styles.composerBar}>
        <label htmlFor={ids.kind} className={styles.kindLabel}>
          Type
        </label>
        <Select
          id={ids.kind}
          className={styles.kindSelect}
          value={kind}
          onChange={(event) => {
            const next = COMPOSER_KINDS.find((option) => option.value === event.target.value)
            if (next) setKind(next.value)
          }}
        >
          {COMPOSER_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <span className={styles.composerHint}>
          Publié en tant que <span className={styles.mono}>{userName.toLowerCase()} · ui</span>.{' '}
          {hasSecret
            ? 'Un secret a été détecté : le serveur le masquera.'
            : 'Scan des secrets avant envoi.'}
        </span>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          className={styles.publish}
          disabled={body.trim() === '' || post.isPending}
        >
          Publier
        </Button>
      </div>
      {post.isError && (
        <p role="alert" className={styles.inlineError}>
          {failureOf(post.error)}
        </p>
      )}
    </form>
  )
}

function JournalSkeleton() {
  return (
    <div className={styles.entries} aria-busy="true" aria-label="Chargement du journal">
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles.entry} aria-hidden="true">
          <Skeleton width={28} height={10} />
          <div className={styles.entryMain}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="90%" height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}
