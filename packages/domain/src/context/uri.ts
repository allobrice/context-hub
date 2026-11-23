import type { Context } from './types.ts'

type WithSlug = Pick<Context, 'slug'>

export const RESOURCE_SCHEME = 'context://'
export const MCP_SERVER_NAME = 'context-hub'

/** URI de la ressource MCP, qui suit toujours la dernière version publiée. */
export function resourceUri(context: WithSlug): string {
  return `${RESOURCE_SCHEME}${context.slug}`
}

/** URI figée sur la version `versionNumber`. */
export function pinnedUri(context: WithSlug, versionNumber: number): string {
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new RangeError(`Numéro de version invalide : ${versionNumber}`)
  }
  return `${resourceUri(context)}@${versionNumber}`
}

/** Mention à coller dans un prompt Claude Code. */
export function mention(context: WithSlug): string {
  return `@${MCP_SERVER_NAME}:${resourceUri(context)}`
}
