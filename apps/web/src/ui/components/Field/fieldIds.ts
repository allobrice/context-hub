/** Id du texte d'aide d'un champ, à passer à `aria-describedby` du contrôle. */
export function fieldHintId(controlId: string): string {
  return `${controlId}-hint`
}
