import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ui/Dialog', () => ({
  DialogRoot: ({ children, onOpenChange }: { children: ReactNode; onOpenChange: (open: boolean) => void }) => (
    <div>{children}<button onClick={() => onOpenChange(false)}>Root close</button>
      <button onClick={() => onOpenChange(true)}>Root stays open</button></div>
  ),
  DialogContent: ({ children, onOverlayClick, onCloseAutoFocus }: {
    children: ReactNode
    onOverlayClick: () => void
    onCloseAutoFocus: (event: { preventDefault: () => void }) => void
  }) => (
    <div>{children}<button onClick={onOverlayClick}>Overlay close</button>
      <button onClick={() => onCloseAutoFocus({ preventDefault: vi.fn() })}>Restore focus</button></div>
  ),
  DialogClose: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children
}))

import ShortcutsOverlay from './ShortcutsOverlay'

describe('ShortcutsOverlay callback branches', () => {
  afterEach(() => vi.restoreAllMocks())

  it('closes through root and overlay callbacks and restores captured focus', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const focus = vi.spyOn(trigger, 'focus')
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)
    fireEvent.click(screen.getByText('Root stays open'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Root close'))
    fireEvent.click(screen.getByText('Overlay close'))
    fireEvent.click(screen.getByText('Restore focus'))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(focus).toHaveBeenCalled()
    trigger.remove()
  })

  it('falls back to the document body when no HTMLElement is active', () => {
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null)
    const focus = vi.spyOn(document.body, 'focus')
    render(<ShortcutsOverlay onClose={vi.fn()} />)
    expect(() => fireEvent.click(screen.getByText('Restore focus'))).not.toThrow()
    expect(focus).toHaveBeenCalled()
  })
})
