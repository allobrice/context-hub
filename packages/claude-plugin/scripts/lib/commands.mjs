// @ts-check
/**
 * Les commandes `/context-hub:*` sont traitées par le hook UserPromptSubmit, qui reçoit le texte brut
 * du prompt : les arguments sont validés ici par expressions régulières, sans jamais passer par un shell.
 */

export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SESSION_LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/
export const MISSION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Comme `isValidTagName` du domaine : minuscules, chiffres, accents et tirets. */
export const TAG_PATTERN = /^[\p{Ll}\p{N}][\p{Ll}\p{N}-]*$/u
const MAX_NEXT_TAGS = 10

/**
 * `mission-create` : le hook ne fait que donner l'identité de la session ; le modèle (skill
 * « créer des missions ») appelle `mission_create` lui-même.
 * @typedef {{ kind: 'join', slug: string, label: string | null }
 *   | { kind: 'new', title: string, label: string | null }
 *   | { kind: 'status' }
 *   | { kind: 'leave' }
 *   | { kind: 'next', tags: string[] }
 *   | { kind: 'take', slug: string }
 *   | { kind: 'missions' }
 *   | { kind: 'mission-create' }
 *   | { kind: 'invalid', command: string, message: string }} PluginCommand
 */

const COMMAND = /^\s*\/context-hub:([a-z]+(?:-[a-z]+)*)(?:\s+([\s\S]*))?$/

/**
 * @param {string} raw
 * @returns {string | null | false} label, null s'il est absent, false s'il est invalide
 */
function labelOf(raw) {
  const label = raw.trim()
  if (label === '') return null
  return SESSION_LABEL_PATTERN.test(label) ? label : false
}

/**
 * @param {string} prompt
 * @returns {PluginCommand | null} null si ce n'est pas une commande du plugin
 */
export function parseCommand(prompt) {
  const match = COMMAND.exec(prompt)
  if (!match) return null
  const [, name = '', rest = ''] = match
  const args = rest.trim()
  switch (name) {
    case 'join': {
      const [slug = '', label = '', ...extra] = args.split(/\s+/)
      const parsedLabel = labelOf(label)
      if (!WORKSPACE_SLUG_PATTERN.test(slug) || parsedLabel === false || extra.length > 0) {
        return {
          kind: 'invalid',
          command: 'join',
          message:
            'Usage : /context-hub:join <slug> [label]. Slug : minuscules, chiffres, tirets ; label : ex. web-1.',
        }
      }
      return { kind: 'join', slug, label: parsedLabel }
    }
    case 'new': {
      const quoted = /^["«“]\s*([\s\S]+?)\s*["»”](?:\s+(\S+))?$/.exec(args)
      const title = ((quoted ? quoted[1] : args) ?? '').replace(/^["«“\s]+|["»”\s]+$/g, '')
      const parsedLabel = labelOf(quoted?.[2] ?? '')
      if (title.trim() === '' || title.length > 120 || parsedLabel === false) {
        return {
          kind: 'invalid',
          command: 'new',
          message: 'Usage : /context-hub:new "<titre>" [label] (titre de 120 caractères au plus).',
        }
      }
      return { kind: 'new', title: title.trim(), label: parsedLabel }
    }
    case 'status':
      return { kind: 'status' }
    case 'leave':
      return { kind: 'leave' }
    case 'next': {
      const tags = args === '' ? [] : args.split(/\s+/).map((tag) => tag.toLowerCase())
      if (tags.length > MAX_NEXT_TAGS || !tags.every((tag) => TAG_PATTERN.test(tag))) {
        return {
          kind: 'invalid',
          command: 'next',
          message: 'Usage : /context-hub:next [tag…] (ex. perf ; minuscules, chiffres, tirets).',
        }
      }
      return { kind: 'next', tags }
    }
    case 'take': {
      if (!MISSION_SLUG_PATTERN.test(args) || args.length > 80) {
        return {
          kind: 'invalid',
          command: 'take',
          message: 'Usage : /context-hub:take <slug> (ex. perf-lcp-carrousel).',
        }
      }
      return { kind: 'take', slug: args }
    }
    case 'missions':
      return { kind: 'missions' }
    case 'mission-create':
      return { kind: 'mission-create' }
    default:
      return null
  }
}

/**
 * « Migration de l’auth » → « migration-de-l-auth » (60 caractères au plus).
 * @param {string} text
 */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

/**
 * Label par défaut : nom du repo + 4 premiers caractères du `session_id` (ex. `front-bead`).
 * @param {string} repo
 * @param {string} sessionId
 */
export function defaultLabel(repo, sessionId) {
  const name = (repo.split('/').at(-1) ?? 'session').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  const suffix =
    sessionId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 4) || 'x'
  return `${name.slice(0, 26).replace(/^[^a-z0-9]+/, '') || 'session'}-${suffix}`
}
