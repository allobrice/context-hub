/**
 * better-sqlite3 est synchrone, les ports sont asynchrones (portabilité vers un driver Postgres).
 * Exécute `work` et renvoie son résultat en promesse ; une exception devient un rejet.
 */
export function deferred<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work())
  })
}
