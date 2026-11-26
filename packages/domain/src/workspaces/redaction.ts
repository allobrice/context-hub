/**
 * Scan d'une entrée de journal (SPEC §7.2) : les secrets sont REMPLACÉS (jamais stockés), une
 * instruction suspecte est conservée mais signalée.
 */
import { REDACTED_SECRET, redactSecrets, scanContent } from '../context/scan.ts'

export interface RedactedEntry {
  readonly body: string
  readonly files: readonly string[]
  /** Nombre de secrets masqués (corps et fichiers). */
  readonly redactions: number
  readonly suspicious: boolean
}

export function redactEntry(body: string, files: readonly string[] = []): RedactedEntry {
  const redactedBody = redactSecrets(body, REDACTED_SECRET)
  let redactions = redactedBody.count
  const redactedFiles = files.map((file) => {
    const redacted = redactSecrets(file, REDACTED_SECRET)
    redactions += redacted.count
    return redacted.text
  })
  return {
    body: redactedBody.text,
    files: redactedFiles,
    redactions,
    suspicious: scanContent(redactedBody.text).some(
      (finding) => finding.kind === 'suspicious-instruction',
    ),
  }
}
