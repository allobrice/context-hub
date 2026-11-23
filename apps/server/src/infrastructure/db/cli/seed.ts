/**
 * `pnpm --filter @context-hub/server db:seed` : migre puis remplit une base VIDE avec les données
 * de démo, et affiche une seule fois le jeton de dev (seul son hash est stocké).
 */
import { openDatabase } from '../connection.ts'
import { Fts5SearchIndex } from '../search/Fts5SearchIndex.ts'
import { DEV_USER, isSeeded, seedDemoData } from '../seed/seedDemoData.ts'
import { databasePath } from './databasePath.ts'

const path = databasePath()
const { db, close } = openDatabase(path)
try {
  if (isSeeded(db)) {
    console.error(`La base ${path} contient déjà des données : seed ignoré.`)
    console.error('Supprimer le fichier pour repartir des données de démo.')
    process.exitCode = 1
  } else {
    const { token } = seedDemoData(db, { now: new Date(), searchIndex: new Fts5SearchIndex() })
    console.info(`Base de démo créée : ${path}`)
    console.info(`Jeton de dev pour « ${DEV_USER.id} » (affiché une seule fois, non récupérable) :`)
    console.info(`\n  ${token}\n`)
    console.info('À placer dans .env.local (CONTEXT_HUB_DEV_TOKEN) ou dans CONTEXT_HUB_TOKEN.')
  }
} finally {
  close()
}
