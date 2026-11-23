/** Concatène des classes CSS en ignorant les valeurs vides (classes de module absentes comprises). */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
