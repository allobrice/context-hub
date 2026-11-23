import type {
  ContextEventListener,
  ContextEvents,
  ContextListChanged,
} from '../../application/ports/ContextEvents.ts'

/**
 * Bus en mémoire du processus : suffit pour un seul processus serveur. Plusieurs instances
 * demanderaient un pub/sub partagé (ROADMAP). Un listener qui lève n'empêche pas les autres.
 */
export class InProcessContextEvents implements ContextEvents {
  private readonly listeners = new Set<ContextEventListener>()

  constructor(private readonly onListenerError: (error: unknown) => void = () => undefined) {}

  emit(event: ContextListChanged): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        this.onListenerError(error)
      }
    }
  }

  subscribe(listener: ContextEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
