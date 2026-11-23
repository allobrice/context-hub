const CHARS_PER_TOKEN = 4

/**
 * Estimation grossière du nombre de tokens (≈ caractères / 4).
 * Toujours affichée précédée de « ≈ » : ce n'est pas un comptage exact.
 */
export function estimateTokens(markdown: string): number {
  return Math.round(markdown.length / CHARS_PER_TOKEN)
}

/** Nombre de lignes d'un contenu (un contenu vide compte une ligne, comme un éditeur). */
export function countLines(markdown: string): number {
  return markdown.split('\n').length
}
