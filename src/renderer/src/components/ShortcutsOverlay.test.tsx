import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import ShortcutsOverlay from './ShortcutsOverlay'

const INDEX_CSS_PATH = resolve(process.cwd(), 'src/renderer/src/index.css')

describe('ShortcutsOverlay', () => {
  it('renders all shortcut sections', () => {
    render(<ShortcutsOverlay onClose={vi.fn()} />)

    expect(screen.getByText('Transport')).toBeTruthy()
    expect(screen.getByText('Project')).toBeTruthy()
    expect(screen.getByText('Placements')).toBeTruthy()
    expect(screen.getByText('Browser')).toBeTruthy()
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('renders all shortcut entries', () => {
    render(<ShortcutsOverlay onClose={vi.fn()} />)

    expect(screen.getByText('Space')).toBeTruthy()
    expect(screen.getByText('Ctrl+S')).toBeTruthy()
    expect(screen.getByText('Save project')).toBeTruthy()
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

    const backdrop = document.querySelector('.mixjam-dialog-overlay')
    expect(backdrop).toBeTruthy()
    fireEvent.pointerDown(backdrop!)
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

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn()
    render(<ShortcutsOverlay onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cleans up keydown listener on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(<ShortcutsOverlay onClose={onClose} />)

    unmount()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('portals the dialog after its backdrop and gives the panel the higher layer', () => {
    render(<ShortcutsOverlay onClose={vi.fn()} />)

    const backdrop = document.querySelector('.mixjam-dialog-overlay')
    const panel = screen.getByRole('dialog')
    expect(backdrop?.parentElement).toBe(panel.parentElement)
    expect([...panel.parentElement!.children].indexOf(backdrop!)).toBeLessThan(
      [...panel.parentElement!.children].indexOf(panel)
    )

    const css = readFileSync(INDEX_CSS_PATH, 'utf8')
    const overlayRule = css.match(/\.mixjam-dialog-overlay\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(overlayRule).toMatch(/z-index:\s*200;/)
    expect(overlayRule).not.toMatch(/backdrop-filter/)
    expect(css).toMatch(/\.mixjam-dialog-content\s*\{[^}]*z-index:\s*201;/m)
  })
})
