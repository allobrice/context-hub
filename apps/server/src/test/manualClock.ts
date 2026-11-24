import type { Clock } from '../application/ports/Clock.ts'

/** Horloge de test qu'on avance à la main : TTL et activité sans `sleep`. */
export class ManualClock implements Clock {
  private current: number

  constructor(start: string | Date) {
    this.current = new Date(start).getTime()
  }

  now(): Date {
    return new Date(this.current)
  }

  advance(ms: number): void {
    this.current += ms
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60 * 1000)
  }
}
