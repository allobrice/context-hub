/**
 * Gabarit du prompt d'une mission (SPEC §8.3) : un Markdown autonome découpé en sections titrées.
 *
 * Le prompt est une donnée non fiable : l'analyse est linéaire, ligne à ligne, sans expression
 * régulière à répétitions imbriquées.
 */

export type PromptSection =
  'objective' | 'finding' | 'files' | 'todo' | 'acceptance' | 'constraints' | 'linkedContexts'

export const REQUIRED_PROMPT_SECTIONS = [
  'objective',
  'finding',
  'files',
  'todo',
  'acceptance',
] as const satisfies readonly PromptSection[]

export type RequiredPromptSection = (typeof REQUIRED_PROMPT_SECTIONS)[number]

export const OPTIONAL_PROMPT_SECTIONS = [
  'constraints',
  'linkedContexts',
] as const satisfies readonly PromptSection[]

export const PROMPT_SECTION_TITLES: Readonly<Record<PromptSection, string>> = {
  objective: 'Objectif',
  finding: 'Constat',
  files: 'Fichiers',
  todo: 'À faire',
  acceptance: "Critères d'acceptation",
  constraints: 'Contraintes',
  linkedContexts: 'Contextes liés',
}

export type TemplateCheck =
  { readonly ok: true } | { readonly ok: false; readonly missing: readonly RequiredPromptSection[] }

const TRAILING_PUNCTUATION = new Set([':', '.', '!', '?', ';', ' '])

/**
 * Forme canonique d'un titre : sans accents ni casse, apostrophe typographique ramenée à « ' »,
 * espaces fusionnés, ponctuation finale retirée (« Critères d’acceptation : » → « criteres d'acceptation »).
 */
function normalizeSectionTitle(title: string): string {
  let normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  while (normalized !== '' && TRAILING_PUNCTUATION.has(normalized.slice(-1))) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

const SECTION_BY_TITLE: ReadonlyMap<string, PromptSection> = new Map(
  [...REQUIRED_PROMPT_SECTIONS, ...OPTIONAL_PROMPT_SECTIONS].map(
    (section): [string, PromptSection] => [
      normalizeSectionTitle(PROMPT_SECTION_TITLES[section]),
      section,
    ],
  ),
)

interface Heading {
  readonly level: number
  readonly title: string
}

function countLeading(line: string, char: string, from: number): number {
  let index = from
  while (line.charAt(index) === char) index += 1
  return index - from
}

/** Indentation de tête (0 à 3 espaces) tolérée par CommonMark, ou -1 si elle dépasse. */
function leadingIndent(line: string): number {
  const indent = countLeading(line, ' ', 0)
  return indent <= 3 ? indent : -1
}

/** Titre ATX (`#` à `######` suivi d'un espace), séquence fermante `#` retirée ; null sinon. */
function parseHeading(line: string): Heading | null {
  const indent = leadingIndent(line)
  if (indent === -1) return null
  const level = countLeading(line, '#', indent)
  if (level < 1 || level > 6) return null
  const separator = line.charAt(indent + level)
  if (separator !== ' ' && separator !== '\t') return null
  let title = line.slice(indent + level).trim()
  let end = title.length
  while (end > 0 && title.charAt(end - 1) === '#') end -= 1
  if (end < title.length && (end === 0 || title.charAt(end - 1) === ' ')) {
    title = title.slice(0, end).trim()
  }
  return { level, title }
}

interface Fence {
  readonly char: string
  readonly length: number
}

/** Ouverture (ou fermeture) de bloc de code clôturé : au moins trois « ` » ou « ~ ». */
function parseFence(line: string): Fence | null {
  const indent = leadingIndent(line)
  if (indent === -1) return null
  const char = line.charAt(indent)
  if (char !== '`' && char !== '~') return null
  const length = countLeading(line, char, indent)
  return length >= 3 ? { char, length } : null
}

function closesFence(line: string, open: Fence): boolean {
  const fence = parseFence(line)
  if (fence?.char !== open.char || fence.length < open.length) return false
  return line.trim().length === fence.length
}

type Line =
  | { readonly kind: 'heading'; readonly heading: Heading }
  | { readonly kind: 'text'; readonly blank: boolean }

/** Classe chaque ligne ; les lignes d'un bloc de code clôturé sont du texte, jamais un titre. */
function classifyLines(markdown: string): Line[] {
  const lines: Line[] = []
  let openFence: Fence | null = null
  for (const raw of markdown.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (openFence !== null) {
      if (closesFence(line, openFence)) openFence = null
      lines.push({ kind: 'text', blank: false })
      continue
    }
    openFence = parseFence(line)
    const heading = openFence === null ? parseHeading(line) : null
    lines.push(
      heading === null ? { kind: 'text', blank: line.trim() === '' } : { kind: 'heading', heading },
    )
  }
  return lines
}

/** Le corps d'un titre (jusqu'au titre suivant de même niveau ou supérieur) a-t-il du contenu ? */
function hasBody(lines: readonly Line[], headingIndex: number, level: number): boolean {
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) return false
    if (line.kind === 'heading') {
      if (line.heading.level <= level) return false
    } else if (!line.blank) {
      return true
    }
  }
  return false
}

/** Sections reconnues dont au moins une occurrence a un corps non vide. */
function filledSections(markdown: string): ReadonlySet<PromptSection> {
  const lines = classifyLines(markdown)
  const filled = new Set<PromptSection>()
  lines.forEach((line, index) => {
    if (line.kind !== 'heading') return
    const section = SECTION_BY_TITLE.get(normalizeSectionTitle(line.heading.title))
    if (section !== undefined && hasBody(lines, index, line.heading.level)) filled.add(section)
  })
  return filled
}

/**
 * Vérifie que le prompt contient chaque section obligatoire, avec un corps non vide. Les titres
 * inconnus sont ignorés ; `missing` suit l'ordre de `REQUIRED_PROMPT_SECTIONS`.
 */
export function validatePromptTemplate(markdown: string): TemplateCheck {
  const filled = filledSections(markdown)
  const missing = REQUIRED_PROMPT_SECTIONS.filter((section) => !filled.has(section))
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

/** Squelette Markdown des sections obligatoires, à remplir (UI, plugin). */
export function promptTemplateSkeleton(): string {
  return REQUIRED_PROMPT_SECTIONS.map((section) => `## ${PROMPT_SECTION_TITLES[section]}\n`).join(
    '\n',
  )
}
