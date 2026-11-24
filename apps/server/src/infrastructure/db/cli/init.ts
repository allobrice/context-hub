/**
 * `pnpm --filter @context-hub/server db:init` : migre puis prépare une base VIDE, sans données de
 * démo (utilisateur de dev, son jeton, collection système), et affiche une seule fois le jeton.
 * Pour la démo des maquettes (42 contextes), utiliser `db:seed`.
 */
import { openDatabase } from '../connection.ts'
import { DEV_USER, isSeeded, seedEmptyWorkspace } from '../seed/seedDemoData.ts'
import { databasePath } from './databasePath.ts'

const path = databasePath()
const { db, close } = openDatabase(path)
try {
  if (isSeeded(db)) {
    console.error(`La base ${path} contient déjà des données : initialisation ignorée.`)
    console.error('Supprimer le fichier (serveur arrêté) pour repartir d’une base vide.')
    process.exitCode = 1
  } else {
    const { token } = seedEmptyWorkspace(db, { now: new Date() })
    console.info(`Base vide initialisée : ${path}`)
    console.info(`Jeton de dev pour « ${DEV_USER.id} » (affiché une seule fois, non récupérable) :`)
    console.info(`\n  ${token}\n`)
    console.info(
      'À placer dans apps/web/.env.local (CONTEXT_HUB_DEV_TOKEN) et dans CONTEXT_HUB_TOKEN.',
    )
  }
} finally {
  close()
}
