import type { ContextEvents, ContextListChanged } from '../../application/ports/ContextEvents.ts'
import type { WorkspaceChanged, WorkspaceEvents } from '../../application/ports/WorkspaceEvents.ts'

/**
 * Bus en mémoire du processus : suffit pour un seul processus serveur. Plusieurs instances
 * demanderaient un pub/sub partagé (ROADMAP). Un listener qui lève n'empêche pas les autres.
 */
export class InProcessEvents<E> {
  private readonly listeners = new Set<(event: E) => void>()
  private readonly onListenerError: (error: unknown) => void

  constructor(onListenerError: (error: unknown) => void = () => undefined) {
    this.onListenerError = onListenerError
  }

  emit(event: E): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        this.onListenerError(error)
      }
    }
  }

  subscribe(listener: (event: E) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export class InProcessContextEvents
  extends InProcessEvents<ContextListChanged>
  implements ContextEvents {}

export class InProcessWorkspaceEvents
  extends InProcessEvents<WorkspaceChanged>
  implements WorkspaceEvents {}
