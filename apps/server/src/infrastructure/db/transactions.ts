/**
 * Transaction d'écriture verrouillée dès son BEGIN (SQLite IMMEDIATE) : deux connexions ne peuvent
 * pas lire le même état puis écrire chacune la leur ; la seconde attend (`busy_timeout`) puis lit
 * l'état écrit par la première. Équivalent Postgres : `SELECT … FOR UPDATE` sur la ligne visée.
 */
export const IMMEDIATE = { behavior: 'immediate' } as const
