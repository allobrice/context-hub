/** Libellés et tons des écrans Workspaces (SPEC §7.3–7.4, maquettes 23–30) : fonctions pures. */
import {
  isSystemAuthor,
  type Claim,
  type EntryAuthor,
  type EntryKind,
  type SystemSource,
  type WorkspaceDisplayStatus,
  type WorkspaceEntry,
} from '@context-hub/domain/workspaces/types.ts'

import type { BadgeTone } from '../../components/Badge/Badge.tsx'
import { formatRelativeDate, plural } from '../../lib/format.ts'

export const DISPLAY_STATUS_LABELS: Readonly<Record<WorkspaceDisplayStatus, string>> = {
  open: 'Ouvert',
  inactive: 'Inactif',
  closed: 'Fermé',
}

export const DISPLAY_STATUS_TONES: Readonly<Record<WorkspaceDisplayStatus, BadgeTone>> = {
  open: 'ok',
  inactive: 'warn',
  closed: 'neutral',
}

export const ENTRY_KIND_LABELS: Readonly<Record<EntryKind, string>> = {
  note: 'Note',
  decision: 'Décision',
  question: 'Question',
  handoff: 'Passation',
  status: 'Statut',
  system: 'Système',
}

const ENTRY_KIND_TONES: Readonly<Record<EntryKind, BadgeTone>> = {
  note: 'neutral',
  decision: 'accent',
  question: 'warn',
  handoff: 'ok',
  status: 'neutral',
  system: 'neutral',
}

/** Filtres du journal (chips de la maquette 26) : les notes ne sont visibles que sous « Tout ». */
export type JournalFilter = 'all' | Exclude<EntryKind, 'note'>

export const JOURNAL_FILTERS: readonly { readonly value: JournalFilter; readonly label: string }[] =
  [
    { value: 'all', label: 'Tout' },
    { value: 'decision', label: 'Décisions' },
    { value: 'question', label: 'Questions' },
    { value: 'handoff', label: 'Passations' },
    { value: 'status', label: 'Statuts' },
    { value: 'system', label: 'Système' },
  ]

/** Types que l'humain peut publier depuis l'UI (composer de la maquette 26). */
export const COMPOSER_KINDS = [
  { value: 'note', label: 'Note' },
  { value: 'decision', label: 'Décision' },
  { value: 'question', label: 'Question' },
  { value: 'handoff', label: 'Passation' },
] as const

const SYSTEM_SOURCE_LABELS: Readonly<Record<SystemSource, string>> = {
  claim: 'claim',
  hook: 'hook PreToolUse',
  lifecycle: 'cycle de vie',
}

/** Un blocage d'écriture par le hook : fond danger (maquette 26, #48). */
export function isBlockedWrite(entry: WorkspaceEntry): boolean {
  return isSystemAuthor(entry.author) && entry.author.system === 'hook'
}

export function entryTone(entry: WorkspaceEntry): BadgeTone {
  return isBlockedWrite(entry) ? 'danger' : ENTRY_KIND_TONES[entry.kind]
}

/** Auteur affiché : session (mono) et « utilisateur · repo », ou « context-hub » et la source. */
export function authorLines(author: EntryAuthor): { session: string; detail: string } {
  if (isSystemAuthor(author)) {
    return { session: 'context-hub', detail: SYSTEM_SOURCE_LABELS[author.system] }
  }
  return {
    session: author.sessionLabel,
    detail: author.repo === null ? author.userName : `${author.userName} · ${author.repo}`,
  }
}

const SECOND = 1000
const MINUTE = 60 * SECOND

const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Activité récente (maquettes 23 et 26) : « il y a 40 s », « il y a 2 min », « il y a 1 h »,
 * « il y a 8 j », puis la date (format relatif de l'application) au-delà de 30 jours.
 */
export function formatElapsed(iso: string, now: Date): string {
  const elapsed = now.getTime() - Date.parse(iso)
  if (elapsed < 5 * SECOND) return 'à l’instant'
  if (elapsed < MINUTE) return `il y a ${Math.floor(elapsed / SECOND)} s`
  if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`
  if (elapsed < DAY) return `il y a ${Math.floor(elapsed / HOUR)} h`
  if (elapsed < 30 * DAY) return `il y a ${Math.floor(elapsed / DAY)} j`
  return formatRelativeDate(iso, now)
}

/** Dernière activité d'un participant : « à l'instant », « il y a 40 s », « inactif · 25 min ». */
export function participantActivity(lastSeenAt: string, active: boolean, now: Date): string {
  if (active) return formatElapsed(lastSeenAt, now)
  const minutes = Math.floor((now.getTime() - Date.parse(lastSeenAt)) / MINUTE)
  return minutes < 60
    ? `inactif · ${minutes} min`
    : `inactif · ${formatRelativeDate(lastSeenAt, now)}`
}

/** Minutes restantes avant l'expiration d'un claim (0 si déjà expiré). */
export function minutesLeft(claim: Pick<Claim, 'expiresAt'>, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(claim.expiresAt) - now.getTime()) / MINUTE))
}

/** Sous 5 minutes, le TTL restant est signalé (warn, SPEC §7.4). */
export const CLAIM_WARNING_MINUTES = 5

/** « 3 actives / 4 » (maquettes 23 et 26). */
export function sessionsLabel(active: number, total: number): string {
  return `${plural(active, 'active', 'actives')} / ${total}`
}

/** Durée d'ouverture d'un workspace fermé : « 2 h 20 », « 3 j ». */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MINUTE))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60}`
  return `${Math.floor(hours / 24)} j`
}

/** Contenu prérempli de l'éditeur pour « Proposer comme contexte » (brouillon, publié par un humain). */
export function proposalFromEntry(
  workspace: { readonly slug: string; readonly title: string },
  entry: WorkspaceEntry,
): { title: string; description: string; content: string } {
  const firstSentence = entry.body.split(/(?<=[.!?])\s/)[0] ?? entry.body
  const title = firstSentence.length > 80 ? `${firstSentence.slice(0, 79)}…` : firstSentence
  const { session } = authorLines(entry.author)
  return {
    title,
    description: `Décision #${entry.seq} du workspace ${workspace.slug}`,
    content: [
      `# ${title}`,
      '',
      entry.body,
      '',
      `> Proposé depuis la décision #${entry.seq} (${session}) du workspace « ${workspace.title} ». À relire avant publication.`,
      ...(entry.files.length > 0
        ? ['', '## Fichiers', '', ...entry.files.map((file) => `- \`${file}\``)]
        : []),
    ].join('\n'),
  }
}
