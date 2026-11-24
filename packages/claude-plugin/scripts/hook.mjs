#!/usr/bin/env node
// @ts-check
/**
 * Point d'entrée des hooks du plugin context-hub : `node hook.mjs <SessionStart|UserPromptSubmit|PreToolUse>`.
 * Lit l'entrée JSON sur stdin, écrit au plus un objet JSON sur stdout, et sort TOUJOURS en code 0 :
 * une panne du plugin ne doit jamais bloquer la session (sauf refus explicite en PreToolUse).
 */
import { readFileSync } from 'node:fs'

import { createApi } from './lib/api.mjs'
import { readConfig } from './lib/config.mjs'
import { systemGit } from './lib/git.mjs'
import { isHookInput, onPreToolUse, onSessionStart, onUserPromptSubmit } from './lib/handlers.mjs'

const HANDLERS = {
  SessionStart: onSessionStart,
  UserPromptSubmit: onUserPromptSubmit,
  PreToolUse: onPreToolUse,
}

/**
 * @param {string} event
 * @returns {event is keyof typeof HANDLERS}
 */
function isHandledEvent(event) {
  return Object.hasOwn(HANDLERS, event)
}

async function main() {
  const event = process.argv[2] ?? ''
  if (!isHandledEvent(event)) return
  /** @type {unknown} */
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return
  }
  if (!isHookInput(input)) return
  const config = readConfig(process.env)
  const deps = { config, api: createApi(config, fetch), git: systemGit, now: () => new Date() }
  try {
    const output = await HANDLERS[event](input, deps)
    if (output !== null) process.stdout.write(JSON.stringify(output))
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'inconnue'
    if (event === 'PreToolUse' && config.failMode === 'closed') {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Écriture bloquée : erreur du hook context-hub (${reason}) et CONTEXT_HUB_FAIL_MODE=closed.`,
          },
        }),
      )
    } else {
      process.stdout.write(
        JSON.stringify({ systemMessage: `context-hub : erreur du hook (${reason}).` }),
      )
    }
  }
}

await main()
