/**
 * jsdom n'implémente ni <dialog>.showModal ni matchMedia ni le presse-papiers.
 * Polyfills minimaux et fidèles au comportement observable utile aux tests.
 */
export function installTestPolyfills(): void {
  const dialogProto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>
  if (typeof dialogProto.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }

  if (typeof window.matchMedia !== 'function') {
    // Seule l'API moderne (addEventListener) est fournie : le code applicatif ne doit pas utiliser addListener.
    window.matchMedia = (query: string) =>
      Object.assign(new EventTarget(), {
        matches: false,
        media: query,
        onchange: null,
      }) as MediaQueryList
  }
}
