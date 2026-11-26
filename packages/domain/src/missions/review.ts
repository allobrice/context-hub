/**
 * Règles de création et de modification d'une mission (SPEC §8.2, §8.3), en fonction pure : le cas
 * d'usage les rejoue côté serveur, qui fait autorité ; l'UI peut s'en servir pour guider la saisie.
 *
 * Une mission est une INSTRUCTION : un secret la fait toujours refuser (jamais masqué) ; une
 * instruction suspecte la fait refuser quand une session l'écrit, et la marque `suspicious` quand
 * c'est un humain.
 */
import {
  containsSecret,
  hasSuspiciousInstruction,
  REDACTED_SECRET,
  redactSecrets,
} from '../context/scan.ts'
import { normalizeRepoPath, REPO_PATTERN } from '../shared/repo.ts'
import { isValidTagName } from '../taxonomy/tags.ts'
import { validatePromptTemplate, type RequiredPromptSection } from './template.ts'
import {
  MISSION_MAX_FILES,
  MISSION_MAX_TAGS,
  MISSION_PROMPT_MAX_LENGTH,
  MISSION_SUMMARY_MAX_LENGTH,
  MISSION_TITLE_MAX_LENGTH,
  type ActorKind,
  type MissionResult,
} from './types.ts'

export type MissionRuleViolation =
  | 'title-empty'
  | 'title-too-long'
  | 'summary-empty'
  | 'summary-too-long'
  | 'prompt-too-long'
  | 'template-incomplete'
  | 'secret-detected'
  | 'suspicious-instruction'
  | 'tag-invalid'
  | 'too-many-tags'
  | 'repo-invalid'
  | 'commit-invalid'
  | 'path-invalid'
  | 'too-many-files'
  | 'slug-taken'
  | 'unknown-context'
  | 'team-required'

export const MISSION_RULE_VIOLATIONS = [
  'title-empty',
  'title-too-long',
  'summary-empty',
  'summary-too-long',
  'prompt-too-long',
  'template-incomplete',
  'secret-detected',
  'suspicious-instruction',
  'tag-invalid',
  'too-many-tags',
  'repo-invalid',
  'commit-invalid',
  'path-invalid',
  'too-many-files',
  'slug-taken',
  'unknown-context',
  'team-required',
] as const satisfies readonly MissionRuleViolation[]

/** Champs relus : texte libre, tags et référence de code. */
export interface MissionContent {
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly tags: readonly string[]
  readonly originLabel: string
  /** Équipe de la portée `team` (texte libre, scanné) ; null pour une autre portée. */
  readonly team: string | null
  readonly codeRef: {
    readonly repo: string
    readonly commit: string
    readonly files: readonly string[]
  }
}

export interface MissionReview {
  readonly violations: readonly MissionRuleViolation[]
  /** Sections obligatoires absentes ou vides (`template-incomplete`). */
  readonly missingSections: readonly RequiredPromptSection[]
  /** Instruction suspecte trouvée (acceptée seulement d'un humain). */
  readonly suspicious: boolean
  /** Fichiers normalisés (« ./ » retiré), dans l'ordre, sans doublon. */
  readonly files: readonly string[]
}

/** SHA abrégé ou complet. */
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/

export function reviewMission(content: MissionContent, author: ActorKind): MissionReview {
  const violations = new Set<MissionRuleViolation>()
  const title = content.title.trim()
  const summary = content.summary.trim()
  if (title === '') violations.add('title-empty')
  if (title.length > MISSION_TITLE_MAX_LENGTH) violations.add('title-too-long')
  if (summary === '') violations.add('summary-empty')
  if (summary.length > MISSION_SUMMARY_MAX_LENGTH) violations.add('summary-too-long')

  // Taille d'abord : le gabarit et le scan ne parcourent jamais un prompt hors limite.
  let missingSections: readonly RequiredPromptSection[] = []
  const promptFits = content.prompt.length <= MISSION_PROMPT_MAX_LENGTH
  if (!promptFits) {
    violations.add('prompt-too-long')
  } else {
    const template = validatePromptTemplate(content.prompt)
    if (!template.ok) {
      violations.add('template-incomplete')
      missingSections = template.missing
    }
  }

  if (content.tags.length > MISSION_MAX_TAGS) violations.add('too-many-tags')
  if (!content.tags.every(isValidTagName)) violations.add('tag-invalid')
  if (!REPO_PATTERN.test(content.codeRef.repo)) violations.add('repo-invalid')
  if (!COMMIT_PATTERN.test(content.codeRef.commit)) violations.add('commit-invalid')
  if (content.codeRef.files.length > MISSION_MAX_FILES) violations.add('too-many-files')
  const files = content.codeRef.files.map(normalizeRepoPath)
  if (files.includes(null)) violations.add('path-invalid')

  const texts = [
    title,
    summary,
    content.originLabel,
    ...(content.team === null ? [] : [content.team]),
    ...content.tags,
    ...content.codeRef.files,
    ...(promptFits ? [content.prompt] : []),
  ]
  if (texts.some(containsSecret)) violations.add('secret-detected')
  const suspicious = texts.some(hasSuspiciousInstruction)
  if (suspicious && author === 'session') violations.add('suspicious-instruction')

  return {
    violations: [...violations],
    missingSections,
    suspicious,
    files: [...new Set(files.filter((file): file is string => file !== null))],
  }
}

// ── Sorties d'une session ────────────────────────────────────────────────────

const redact = (text: string) => redactSecrets(text, REDACTED_SECRET).text

/**
 * Résultat rapporté par une session : conservé (c'est une donnée, pas une instruction), mais ses
 * secrets éventuels sont masqués, comme ceux d'une entrée de workspace.
 */
export function redactMissionResult(result: MissionResult): MissionResult {
  return {
    summary: redact(result.summary),
    deliverables: result.deliverables.map(({ kind, ref }) => ({ kind, ref: redact(ref) })),
    metrics: result.metrics.map(({ name, before, after }) => ({
      name: redact(name),
      before: redact(before),
      after: redact(after),
    })),
    acceptanceMet: result.acceptanceMet,
  }
}

/**
 * Fichiers rapportés par `mission_freshness` (sortie d'une session, affichée dans l'UI) : chemins
 * relatifs normalisés, invalides écartés, secrets masqués, sans doublon.
 */
export function cleanChangedFiles(files: readonly string[]): string[] {
  const paths = files.map(normalizeRepoPath).filter((path): path is string => path !== null)
  return [...new Set(paths.map(redact))]
}

/** Raison d’abandon ou de rejet : masquée de la même façon. */
export function redactReason(reason: string): string {
  return redact(reason)
}
