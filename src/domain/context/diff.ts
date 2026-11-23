export type DiffLine =
  | { readonly kind: 'same'; readonly text: string }
  | { readonly kind: 'added'; readonly text: string }
  | { readonly kind: 'removed'; readonly text: string }

/**
 * Différence ligne à ligne (plus longue sous-séquence commune), de `before` vers `after`.
 * Suffisant pour quelques centaines de lignes (contexte Markdown) ; O(n × m) en mémoire.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const rows = a.length + 1
  const cols = b.length + 1
  const lcs = new Uint32Array(rows * cols)
  const at = (i: number, j: number) => lcs[i * cols + j] ?? 0

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const left = a[i]
    const right = b[j]
    if (left !== undefined && right !== undefined && left === right) {
      result.push({ kind: 'same', text: left })
      i += 1
      j += 1
    } else if (right !== undefined && (left === undefined || at(i, j + 1) >= at(i + 1, j))) {
      result.push({ kind: 'added', text: right })
      j += 1
    } else if (left !== undefined) {
      result.push({ kind: 'removed', text: left })
      i += 1
    }
  }
  return result
}

export function hasChanges(diff: readonly DiffLine[]): boolean {
  return diff.some((line) => line.kind !== 'same')
}
