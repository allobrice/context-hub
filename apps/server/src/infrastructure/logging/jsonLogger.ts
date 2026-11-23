import type { LogFields, Logger } from '../../application/ports/Logger.ts'

/** Une ligne JSON par évènement, sur la sortie standard (info) ou d'erreur (error). */
export function createJsonLogger(write: (line: string, level: 'info' | 'error') => void): Logger {
  const log = (level: 'info' | 'error', event: string, fields: LogFields = {}) => {
    write(JSON.stringify({ at: new Date().toISOString(), level, event, ...fields }), level)
  }
  return {
    info: (event, fields) => {
      log('info', event, fields)
    },
    error: (event, fields) => {
      log('error', event, fields)
    },
  }
}

export const consoleLogger: Logger = createJsonLogger((line, level) => {
  if (level === 'error') console.error(line)
  else console.info(line)
})
