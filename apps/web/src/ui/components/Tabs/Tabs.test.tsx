import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { TabPanel, Tabs } from './Tabs.tsx'

function Taxonomy() {
  const [tab, setTab] = useState<'tags' | 'collections'>('tags')
  return (
    <>
      <Tabs
        label="Taxonomie"
        idPrefix="tx"
        selected={tab}
        onSelect={setTab}
        items={[
          { id: 'tags', label: 'Tags', count: 34 },
          { id: 'collections', label: 'Collections', count: 6 },
        ]}
      />
      <TabPanel idPrefix="tx" id={tab}>
        contenu {tab}
      </TabPanel>
    </>
  )
}

describe('Tabs', () => {
  it('relie onglet et panneau, compteur compris dans le nom', () => {
    render(<Taxonomy />)
    const tab = screen.getByRole('tab', { name: 'Tags 34' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Tags 34' })).toHaveTextContent('contenu tags')
  })

  it('change d’onglet aux flèches', async () => {
    render(<Taxonomy />)
    await userEvent.click(screen.getByRole('tab', { name: 'Tags 34' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Collections 6' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('contenu collections')
  })
})
