/** Identifiants reliant un onglet et son panneau (aria-controls / aria-labelledby). */
export function tabId(idPrefix: string, id: string): string {
  return `${idPrefix}-tab-${id}`
}

export function tabPanelId(idPrefix: string, id: string): string {
  return `${idPrefix}-panel-${id}`
}
