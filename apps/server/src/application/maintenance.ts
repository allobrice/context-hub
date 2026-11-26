/**
 * Tâches de maintenance périodiques (fermeture des workspaces inactifs, expiration des missions…),
 * déclarées par la composition et exécutées par `main.ts`.
 */
import type { LogFields, Logger } from './ports/Logger.ts'

export interface MaintenanceTask {
  /** Préfixe des événements journalisés : `<name>.maintenance`, `<name>.maintenance_failed`. */
  readonly name: string
  /** Renvoie des compteurs (jamais de contenu), journalisés tels quels. */
  readonly run: () => Promise<LogFields>
}

/** Exécute chaque tâche, en séquence ; l'échec de l'une n'empêche pas les suivantes. */
export async function runMaintenance(
  tasks: readonly MaintenanceTask[],
  logger: Logger,
): Promise<void> {
  for (const task of tasks) {
    try {
      logger.info(`${task.name}.maintenance`, await task.run())
    } catch (error) {
      logger.error(`${task.name}.maintenance_failed`, {
        error: error instanceof Error ? error.name : 'unknown',
      })
    }
  }
}
