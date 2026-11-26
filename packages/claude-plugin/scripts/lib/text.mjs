// @ts-check
/**
 * Texte injecté au modèle (`additionalContext`) : plafond, et neutralisation des textes écrits par
 * des tiers (titres, prompts de mission), qui ne doivent ni imiter le compte rendu du hook ni fermer
 * (ou rouvrir) la balise `<context-hub>` qui l'entoure.
 */

/** Plafond de `additionalContext` (10 000 caractères côté Claude Code), avec une marge. */
export const MAX_CONTEXT_CHARS = 9_500

/** Tout séparateur de ligne : `\n`, `\r`, et les séparateurs Unicode U+2028 / U+2029. */
const LINE_BREAKS = /\r\n|[\n\r\u2028\u2029]/

/** @param {string} text */
function neutralizeTag(text) {
  return text.replace(/<(\/?)context-hub/gi, '‹$1context-hub')
}

/**
 * Texte d'un tiers sur UNE ligne (titre, auteur, statut) : caractères de contrôle et séparateurs
 * remplacés par une espace, balise neutralisée.
 * @param {string} text
 */
export function oneLine(text) {
  let flattened = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    flattened += code < 0x20 || code === 0x7f || char === '\u2028' || char === '\u2029' ? ' ' : char
  }
  return neutralizeTag(flattened).trim()
}

/**
 * Texte d'un tiers cité ligne à ligne (`│ `) : aucune ligne ne peut imiter un en-tête du compte
 * rendu.
 * @param {string} text
 */
export function quoted(text) {
  return neutralizeTag(text)
    .split(LINE_BREAKS)
    .map((line) => `│ ${line}`)
    .join('\n')
}

/**
 * Heure locale d'une date ISO (ex. « 10:42 », ou « 10:42 UTC+1 » avec le fuseau).
 * @param {string} iso
 * @param {{ zone?: boolean }} [options]
 */
export function clockTime(iso, { zone = false } = {}) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        ...(zone ? { timeZoneName: 'short' } : {}),
      })
}
