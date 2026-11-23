/** Type nominal : empêche de mélanger deux `string` de sens différent (ex. un ContextId et un slug). */
export type Brand<T, B extends string> = T & { readonly __brand: B }
