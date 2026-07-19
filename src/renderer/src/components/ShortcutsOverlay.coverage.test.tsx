import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ShortcutsOverlay from './ShortcutsOverlay'

function ShortcutsHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open shortcuts</button>
      {open ? <ShortcutsOverlay onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function OpenShortcutsHarness() {
  const [open, setOpen] = useState(true)
  return open ? <ShortcutsOverlay onClose={() => setOpen(false)} /> : null
}

describe('ShortcutsOverlay focus lifecycle', () => {
  it('restores focus to the opener after the dialog closes', async () => {
    render(<ShortcutsHarness />)
    const trigger = screen.getByRole('button', { name: 'Open shortcuts' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close shortcuts' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })

  it('falls back to the document body when the prior active element is not HTML', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    vi.spyOn(document, 'activeElement', 'get').mockReturnValueOnce(svg)
    const bodyFocus = vi.spyOn(document.body, 'focus')

    render(<OpenShortcutsHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Close shortcuts' }))

    await waitFor(() => expect(bodyFocus).toHaveBeenCalled())
  })
})
