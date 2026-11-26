/**
 * Scan indicatif du contenu Markdown d'un contexte.
 *
 * ⚠️ Côté UI, ce scan n'est qu'une aide : le serveur devra le refaire et c'est lui qui fera autorité.
 */

export type ScanFinding =
  | {
      readonly kind: 'secret'
      readonly line: number
      readonly pattern: string
      readonly label: string
    }
  | { readonly kind: 'suspicious-instruction'; readonly line: number; readonly excerpt: string }

interface SecretRule {
  /** Motif affiché à l'utilisateur (ex. « sk_live_ »). */
  readonly pattern: string
  readonly label: string
  /** Doit correspondre à la valeur secrète elle-même (utilisé pour le masquage et le remplacement). */
  readonly regex: RegExp
}

const SECRET_RULES: readonly SecretRule[] = [
  { pattern: 'sk_live_', label: 'clé d’API', regex: /sk_live_[A-Za-z0-9•*]{6,}/ },
  { pattern: 'sk-', label: 'clé d’API', regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/ },
  { pattern: 'ghp_', label: 'jeton GitHub', regex: /\bghp_[A-Za-z0-9]{20,}/ },
  { pattern: 'chub_', label: 'jeton Context Hub', regex: /\bchub_[A-Za-z0-9_-]{20,}/ },
  { pattern: 'AKIA', label: 'clé d’accès AWS', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { pattern: '-----BEGIN', label: 'clé privée', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    pattern: 'password=',
    label: 'mot de passe',
    regex: /\bpassword\s*[=:]\s*["']?(?![*<${])[^\s"'`]{4,}/i,
  },
]

const SUSPICIOUS_RULES: readonly RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+instructions\b/i,
  /\bignore[rz]?\s+(?:toutes\s+)?les\s+instructions\s+(?:pr[ée]c[ée]dentes|ci-dessus)\b/i,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|messages)\b/i,
  // Exfiltration : image ou lien Markdown vers une URL externe qui embarque des données en query string.
  // Répétitions BORNÉES (texte du lien ≤ 200, URL ≤ 300 + 300) : sans borne, une ligne de « [ » ou
  // de « ?a » faisait un travail quadratique (ReDoS, ~2 s pour 80 000 caractères, audit phase 6).
  /!?\[[^\]]{0,200}\]\(https?:\/\/[^)\s?]{1,300}\?[^)\s]{0,300}=\s*(?:\{|\$|%7B)/i,
  /https?:\/\/(?:[a-z0-9-]+\.)*(?:webhook\.site|requestbin\.(?:com|net)|pipedream\.net|ngrok(?:-free)?\.(?:io|app))\b/i,
]

const EXCERPT_MAX_LENGTH = 80

function excerptOf(line: string): string {
  const trimmed = line.trim()
  return trimmed.length > EXCERPT_MAX_LENGTH
    ? `${trimmed.slice(0, EXCERPT_MAX_LENGTH - 1)}…`
    : trimmed
}

/** Détecte les secrets et instructions suspectes, ligne par ligne (numéros de ligne à partir de 1). */
export function scanContent(markdown: string): ScanFinding[] {
  const findings: ScanFinding[] = []
  markdown.split('\n').forEach((text, index) => {
    const line = index + 1
    for (const rule of SECRET_RULES) {
      if (rule.regex.test(text)) {
        findings.push({ kind: 'secret', line, pattern: rule.pattern, label: rule.label })
      }
    }
    if (SUSPICIOUS_RULES.some((regex) => regex.test(text))) {
      findings.push({ kind: 'suspicious-instruction', line, excerpt: excerptOf(text) })
    }
  })
  return findings
}

export function hasSecret(findings: readonly ScanFinding[]): boolean {
  return findings.some((finding) => finding.kind === 'secret')
}

/** Un texte libre (titre, objectif, résumé…) contient-il un secret ? Il est alors refusé, pas masqué. */
export function containsSecret(text: string): boolean {
  return hasSecret(scanContent(text))
}

/** Un texte contient-il une instruction suspecte (injection, exfiltration) ? */
export function hasSuspiciousInstruction(text: string): boolean {
  return scanContent(text).some((finding) => finding.kind === 'suspicious-instruction')
}

const MASK_CHAR = '•'
const MASK_VISIBLE_START = 4
const MASK_VISIBLE_END = 3
const MASK_LENGTH = 12

/**
 * Masque un secret pour l'affichage : préfixe connu + 4 caractères, puis 3 derniers.
 * `sk_live_51HxAbCdEf…3kQ` → `sk_live_51Hx••••••••••••3kQ`.
 */
export function maskSecret(secret: string, knownPrefix = ''): string {
  const prefix = secret.startsWith(knownPrefix) ? knownPrefix : ''
  const rest = secret.slice(prefix.length)
  if (rest.length <= MASK_VISIBLE_START + MASK_VISIBLE_END) {
    return `${prefix}${MASK_CHAR.repeat(MASK_LENGTH)}`
  }
  return `${prefix}${rest.slice(0, MASK_VISIBLE_START)}${MASK_CHAR.repeat(MASK_LENGTH)}${rest.slice(-MASK_VISIBLE_END)}`
}

/** Masque tous les secrets reconnus dans un texte (pour l'aperçu et les messages). */
export function maskSecretsIn(text: string): string {
  return SECRET_RULES.reduce(
    (masked, rule) =>
      masked.replace(new RegExp(rule.regex.source, `${rule.regex.flags}g`), (match) =>
        maskSecret(match, rule.pattern),
      ),
    text,
  )
}

/** Bloc de clé privée complet (en-tête, corps base64, pied ou fin du texte). */
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g

/** Remplace un secret dans un texte conservé (journal, résultat de mission) : rien n'est stocké. */
export const REDACTED_SECRET = '[secret masqué]'

/**
 * REMPLACE chaque secret reconnu par `replacement` (contrairement à `maskSecretsIn`, rien de la valeur
 * ne subsiste) et compte les remplacements. Une clé privée est retirée en entier, corps compris.
 */
export function redactSecrets(text: string, replacement: string): { text: string; count: number } {
  let count = 0
  const replace = (): string => {
    count += 1
    return replacement
  }
  const redacted = SECRET_RULES.reduce(
    (current, rule) =>
      current.replace(new RegExp(rule.regex.source, `${rule.regex.flags}g`), replace),
    text.replace(PRIVATE_KEY_BLOCK, replace),
  )
  return { text: redacted, count }
}

export interface VariableReplacement {
  /** Nom de la variable proposée, ex. NUXT_API_KEY. */
  readonly variable: string
  /** Contenu complet après remplacement. */
  readonly content: string
}

const ASSIGNMENT = /^(\s*(?:export\s+)?)([A-Z][A-Z0-9_]*)(\s*[=:]\s*)(.*)$/
const FALLBACK_VARIABLE = 'SECRET'

/**
 * Propose « Remplacer par ${VAR} » pour un finding de type secret.
 * - `NUXT_API_KEY=sk_live_…` → `NUXT_API_KEY=${NUXT_API_KEY}`
 * - sinon, la valeur secrète seule est remplacée par `${SECRET}`.
 * Retourne null si le finding n'est pas un secret ou si la ligne ne contient plus de secret.
 */
export function suggestVariableReplacement(
  markdown: string,
  finding: ScanFinding,
): VariableReplacement | null {
  if (finding.kind !== 'secret') return null
  const lines = markdown.split('\n')
  const index = finding.line - 1
  const text = lines[index]
  const rule = SECRET_RULES.find((candidate) => candidate.pattern === finding.pattern)
  if (text === undefined || !rule?.regex.test(text)) return null

  const assignment = ASSIGNMENT.exec(text)
  let replaced: string
  let variable: string
  if (assignment) {
    const [, lead = '', name = FALLBACK_VARIABLE, separator = '='] = assignment
    variable = name
    replaced = `${lead}${name}${separator}\${${name}}`
  } else {
    variable = FALLBACK_VARIABLE
    replaced = text.replace(rule.regex, `\${${FALLBACK_VARIABLE}}`)
  }
  lines[index] = replaced
  return { variable, content: lines.join('\n') }
}

/** Clé stable d'un finding, pour le marquer comme faux positif. */
export function findingKey(finding: ScanFinding): string {
  return finding.kind === 'secret'
    ? `secret:${finding.line}:${finding.pattern}`
    : `suspicious-instruction:${finding.line}`
}

/** Findings restants une fois retirés ceux marqués comme faux positifs. */
export function activeFindings(
  findings: readonly ScanFinding[],
  ignoredKeys: ReadonlySet<string>,
): ScanFinding[] {
  return findings.filter((finding) => !ignoredKeys.has(findingKey(finding)))
}

/**
 * Findings locaux complétés par ceux du serveur (qui fait autorité), sans doublon (`findingKey`),
 * triés par ligne. Sert à afficher dans l'éditeur un refus de publication du serveur.
 */
export function mergeFindings(
  local: readonly ScanFinding[],
  server: readonly ScanFinding[],
): ScanFinding[] {
  const byKey = new Map(local.map((finding) => [findingKey(finding), finding]))
  for (const finding of server) {
    if (!byKey.has(findingKey(finding))) byKey.set(findingKey(finding), finding)
  }
  return [...byKey.values()].sort((a, b) => a.line - b.line)
}
