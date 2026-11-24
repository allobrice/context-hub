/**
 * `pnpm --filter @context-hub/server db:token [--user <id>] [--label <libellé>]` : émet un NOUVEAU
 * jeton d'API pour un utilisateur d'une base existante, sans toucher aux données ni aux autres
 * jetons. Le jeton n'est affiché qu'une fois (seul son hash est stocké).
 */
import { parseArgs } from 'node:util'

import { openDatabase } from '../connection.ts'
import { issueApiToken } from '../seed/issueApiToken.ts'
import { DEV_USER, isSeeded } from '../seed/seedDemoData.ts'
import { databasePath } from './databasePath.ts'

const DEFAULT_LABEL = 'Jeton émis par db:token'
const LABEL_MAX_LENGTH = 100

const { values } = parseArgs({
  options: {
    user: { type: 'string', default: DEV_USER.id },
    label: { type: 'string', default: DEFAULT_LABEL },
  },
})
const userId = values.user.trim()
const label = values.label.trim().slice(0, LABEL_MAX_LENGTH) || DEFAULT_LABEL

const path = databasePath()
const { db, close } = openDatabase(path)
try {
  if (!isSeeded(db)) {
    console.error(`La base ${path} est vide : lancer d’abord db:init (ou db:seed).`)
    process.exitCode = 1
  } else {
    const issued = issueApiToken(db, { userId, label, now: new Date() })
    if (issued === null) {
      console.error(`Utilisateur « ${userId} » inconnu dans ${path}.`)
      process.exitCode = 1
    } else {
      console.info(`Nouveau jeton pour « ${userId} » (affiché une seule fois, non récupérable) :`)
      console.info(`\n  ${issued.token}\n`)
      console.info(
        'À placer dans apps/web/.env.local (CONTEXT_HUB_DEV_TOKEN, puis relancer pnpm dev) et dans CONTEXT_HUB_TOKEN.',
      )
      console.info('Les jetons déjà émis restent valides.')
    }
  }
} finally {
  close()
}
