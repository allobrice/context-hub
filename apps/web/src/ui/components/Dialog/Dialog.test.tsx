import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Dialog } from './Dialog.tsx'

function Harness({ role }: { role?: 'dialog' | 'alertdialog' }) {
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        Fusionner…
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="Fusionner 2 tags"
        role={role}
        footer={<button onClick={close}>Annuler</button>}
      >
        <p>Impact</p>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('s’ouvre sur un <dialog> natif, nommé par son titre', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Fusionner…' }))
    const dialog = screen.getByRole('dialog', { name: 'Fusionner 2 tags' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByText('Impact')).toBeVisible()
  })

  it('se ferme sur « Fermer » et rend le focus au déclencheur', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Fusionner…' })
    await userEvent.click(opener)
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('se ferme sur Échap (événement cancel)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Fusionner…' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('peut être un alertdialog', async () => {
    render(<Harness role="alertdialog" />)
    await userEvent.click(screen.getByRole('button', { name: 'Fusionner…' }))
    expect(screen.getByRole('alertdialog', { name: 'Fusionner 2 tags' })).toBeInTheDocument()
  })
})
