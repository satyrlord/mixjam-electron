import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ShortcutsOverlay from './ShortcutsOverlay'

describe('ShortcutsOverlay', () => {
  it('renders all shortcut sections', () => {
    render(<ShortcutsOverlay onClose={vi.fn()} />)

    expect(screen.getByText('Transport')).toBeTruthy()
    expect(screen.getByText('Placements')).toBeTruthy()
    expect(screen.getByText('Browser')).toBeTruthy()
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('renders all shortcut entries', () => {
    render(<ShortcutsOverlay onClose={vi.fn()} />)

    expect(screen.getByText('Space')).toBeTruthy()
    expect(screen.getByText('Play / pause / cancel preparation')).toBeTruthy()
    expect(screen.getByText('Ctrl+Z')).toBeTruthy()
    expect(screen.getByText('Undo placement edit')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('Remove selected placements')).toBeTruthy()
    expect(screen.getByText('?')).toBeTruthy()
    expect(screen.getByText('Show this overlay')).toBeTruthy()
    expect(screen.getByText('Esc')).toBeTruthy()
    expect(screen.getByText('Close')).toBeTruthy()
  })

  it('has dialog ARIA role', () => {
    render(<ShortcutsOverlay onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Keyboard shortcuts')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close shortcuts'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)

    // Backdrop is the outer div with class shortcuts-overlay
    const backdrop = document.querySelector('.shortcuts-overlay')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when panel itself is clicked', () => {
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)

    const panel = document.querySelector('.shortcuts-panel')
    expect(panel).toBeTruthy()
    fireEvent.click(panel!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cleans up keydown listener on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(<ShortcutsOverlay onClose={onClose} />)

    unmount()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
