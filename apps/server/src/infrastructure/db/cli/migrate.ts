/** `pnpm --filter @context-hub/server db:migrate` : applique les migrations Drizzle. */
import { openDatabase } from '../connection.ts'
import { databasePath } from './databasePath.ts'

const path = databasePath()
openDatabase(path).close()
console.info(`Migrations appliquées : ${path}`)
