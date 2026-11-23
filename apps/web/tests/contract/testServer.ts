/**
 * Serveur Context Hub réel pour la suite de contrat HTTP, lancé en PROCESSUS ENFANT (le front
 * n'importe jamais le code serveur) : seed d'une base modèle une fois, puis un serveur par test
 * sur une copie neuve de cette base, à l'écoute d'un port libre de 127.0.0.1.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SERVER_DIR = join(import.meta.dirname, '../../../server')
const TSX = join(SERVER_DIR, 'node_modules/.bin/tsx')
const START_TIMEOUT_MS = 15_000

export interface SeededTemplate {
  readonly directory: string
  readonly databasePath: string
  /** Jeton de dev du seed, propre à cette base temporaire. */
  readonly token: string
}

export interface RunningServer {
  readonly baseUrl: string
  readonly stop: () => Promise<void>
}

function run(args: readonly string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(TSX, [...args], {
    cwd: SERVER_DIR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** Attend sur stdout une ligne qui satisfait `match` ; rejette si le processus s'arrête avant. */
function waitForOutput(
  child: ChildProcess,
  match: (output: string) => string | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      reject(new Error(`Serveur de test muet après ${START_TIMEOUT_MS} ms :\n${output}`))
    }, START_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const found = match(output)
      if (found !== null) {
        clearTimeout(timer)
        resolve(found)
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('exit', (code: number | null) => {
      clearTimeout(timer)
      reject(new Error(`Processus serveur arrêté (code ${String(code)}) :\n${output}`))
    })
  })
}

/** Base de démo seedée une fois pour toute la suite. */
export async function seedTemplate(): Promise<SeededTemplate> {
  const directory = mkdtempSync(join(tmpdir(), 'context-hub-contract-'))
  const databasePath = join(directory, 'template.db')
  const seed = run(['src/infrastructure/db/cli/seed.ts'], { CONTEXT_HUB_DB_PATH: databasePath })
  const token = await waitForOutput(seed, (output) => /chub_[\w-]+/.exec(output)?.[0] ?? null)
  await new Promise((resolve) => seed.once('close', resolve))
  return { directory, databasePath, token }
}

let sequence = 0

/** Un serveur sur une copie neuve de la base modèle (état identique à chaque test). */
export async function startServer(template: SeededTemplate): Promise<RunningServer> {
  sequence += 1
  const databasePath = join(template.directory, `run-${sequence}.db`)
  copyFileSync(template.databasePath, databasePath)
  const child = run(['src/main.ts'], {
    CONTEXT_HUB_DB_PATH: databasePath,
    CONTEXT_HUB_HOST: '127.0.0.1',
    CONTEXT_HUB_PORT: '0',
  })
  const baseUrl = await waitForOutput(child, (output) => {
    const listening = /"event":"server\.listening","url":"(http:\/\/[^"]+)"/.exec(output)
    return listening?.[1] ?? null
  })
  return {
    baseUrl,
    stop: () =>
      new Promise((resolve) => {
        child.once('close', () => {
          rmSync(databasePath, { force: true })
          resolve()
        })
        child.kill('SIGTERM')
      }),
  }
}

export function removeTemplate(template: SeededTemplate): void {
  rmSync(template.directory, { recursive: true, force: true })
}
