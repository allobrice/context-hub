/** Repo git `owner/name`, comme l'en-tête `X-Context-Hub-Repo` et le remote déduit par le plugin. */
export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

/** Longueur maximale d'un chemin (ou d'une zone) relatif à la racine d'un repo. */
export const REPO_PATH_MAX_LENGTH = 300

/** Caractères de contrôle (dont le retour à la ligne) : jamais dans un chemin. */
export function hasControlCharacter(value: string): boolean {
  for (const char of value) if (char.charCodeAt(0) < 0x20 || char === '\u007f') return true
  return false
}

export function hasDotSegment(path: string): boolean {
  return path.split('/').some((segment) => segment === '..' || segment === '.')
}

/**
 * Chemin de fichier relatif à la racine du repo, normalisé (« ./ » de tête retiré) ; null s'il est
 * vide, absolu, remonte (`..`) ou contient un caractère de contrôle.
 */
export function normalizeRepoPath(raw: string): string | null {
  let path = raw.trim()
  while (path.startsWith('./')) path = path.slice(2)
  if (path === '' || path.length > REPO_PATH_MAX_LENGTH) return null
  if (path.startsWith('/') || path.includes('\\') || path.includes('//')) return null
  if (hasControlCharacter(path) || hasDotSegment(path)) return null
  return path
}
