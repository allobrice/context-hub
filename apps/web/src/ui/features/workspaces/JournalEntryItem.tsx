import type { Workspace, WorkspaceEntry } from '@context-hub/domain/workspaces/types.ts'
import { paths } from '../../app/paths.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import {
  authorLines,
  ENTRY_KIND_LABELS,
  entryTone,
  formatElapsed,
  isBlockedWrite,
  proposalFromEntry,
} from './workspacePresentation.ts'
import styles from './Workspace.module.scss'

/**
 * Une entrée du journal. Le corps est une DONNÉE non fiable écrite par une session : il est rendu en
 * texte brut (jamais en Markdown ni en HTML).
 */
export function JournalEntryItem({
  entry,
  workspace,
  now,
}: {
  entry: WorkspaceEntry
  workspace: Workspace
  now: Date
}) {
  const { session, detail } = authorLines(entry.author)
  const blocked = isBlockedWrite(entry)
  return (
    <li
      className={cx(
        styles.entry,
        blocked && styles.entryDanger,
        !blocked && entry.redactions > 0 && styles.entryWarn,
      )}
    >
      <span className={styles.seq}>#{entry.seq}</span>
      <div className={styles.entryMain}>
        <div className={styles.entryHead}>
          <Badge tone={entryTone(entry)}>{ENTRY_KIND_LABELS[entry.kind]}</Badge>
          <span className={styles.session}>{session}</span>
          <span className={styles.muted}>{detail}</span>
          {entry.suspicious && (
            <Badge tone="warn" className={styles.suspicious}>
              Instruction suspecte
            </Badge>
          )}
          <time dateTime={entry.createdAt} className={styles.entryTime}>
            {formatElapsed(entry.createdAt, now)}
          </time>
        </div>
        <p className={styles.entryBody}>
          {entry.body}
          {entry.redactions > 0 && (
            <span className={styles.redaction}>
              {' '}
              [{plural(entry.redactions, 'secret masqué', 'secrets masqués')} par le scan]
            </span>
          )}
        </p>
        {entry.files.length > 0 && (
          <div className={styles.tags}>
            {entry.files.map((file) => (
              <Tag key={file} name={file} />
            ))}
          </div>
        )}
        {entry.kind === 'decision' && (
          <div>
            <ButtonLink size="sm" to={paths.proposeContext(proposalFromEntry(workspace, entry))}>
              Proposer comme contexte
            </ButtonLink>
          </div>
        )}
      </div>
    </li>
  )
}
