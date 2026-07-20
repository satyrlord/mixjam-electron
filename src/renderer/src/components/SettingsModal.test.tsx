import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FolderView } from '../hooks/useFolderSetup'
import SettingsModal from './SettingsModal'

describe('SettingsModal', () => {
  const defaultProps = {
    userFolder: { status: 'set', ref: { id: 'user', name: 'MixJam Projects' } },
    uiSize: 40,
    clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 },
    onSelectUserFolder: vi.fn(),
    onUiSizeChange: vi.fn(),
    onSetClipEdgeMicroFades: vi.fn(),
    onClose: vi.fn(),
    onRestoreFocus: vi.fn()
  } as const

  it('contains the User Folder, Zoom Level, and Clip Edge Fades settings', () => {
    render(<SettingsModal {...defaultProps} />)

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'User Folder' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zoom Level' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clip Edge Fades' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current User Folder')).toHaveTextContent('MixJam Projects')
  })

  it('uses the existing User Folder action', () => {
    const onSelectUserFolder = vi.fn()
    render(<SettingsModal {...defaultProps} onSelectUserFolder={onSelectUserFolder} />)

    fireEvent.click(screen.getByRole('button', { name: 'Select User Folder' }))
    expect(onSelectUserFolder).toHaveBeenCalledOnce()
  })

  it.each<[FolderView, string]>([
    [{ status: 'set', ref: null }, 'Selected folder'],
    [{ status: 'needs-permission', ref: { id: 'user', name: 'Old folder' } }, 'Folder access needs to be restored.'],
    [{ status: 'pick-error', ref: null }, 'The selected folder could not be accessed.'],
    [{ status: 'restore-error', ref: null }, 'The saved folder is no longer accessible.'],
    [{ status: 'empty', ref: null }, 'No User Folder selected.']
  ])('describes the User Folder recovery state', (userFolder, status) => {
    render(<SettingsModal {...defaultProps} userFolder={userFolder} />)

    expect(screen.getByLabelText('Current User Folder')).toHaveTextContent(status)
  })

  it('ignores pointer and focus interaction outside the modal', () => {
    const onClose = vi.fn()
    const outside = document.createElement('button')
    document.body.append(outside)
    render(<SettingsModal {...defaultProps} onClose={onClose} />)

    fireEvent.pointerDown(outside)
    fireEvent.focusIn(outside)

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    outside.remove()
  })

  it('offers every Zoom Level and reports the selected level', () => {
    const onUiSizeChange = vi.fn()
    render(<SettingsModal {...defaultProps} onUiSizeChange={onUiSizeChange} />)
    const zoom = screen.getByRole('group', { name: 'Zoom Level' })

    expect(within(zoom).getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(zoom).getByRole('button', { name: '75%' }))
    fireEvent.click(within(zoom).getByRole('button', { name: '125%' }))
    expect(onUiSizeChange.mock.calls).toEqual([[30], [50]])
  })

  it('edits and clamps project-owned clip-edge fade settings', () => {
    const onSetClipEdgeMicroFades = vi.fn()
    render(
      <SettingsModal
        {...defaultProps}
        onSetClipEdgeMicroFades={onSetClipEdgeMicroFades}
      />
    )

    fireEvent.click(screen.getByRole('checkbox', {
      name: 'Enable automatic clip-edge fades'
    }))
    expect(onSetClipEdgeMicroFades).toHaveBeenCalledWith({
      enabled: false,
      fadeInMs: 2,
      fadeOutMs: 4
    })

    const fadeIn = screen.getByRole('spinbutton', {
      name: 'Automatic clip fade-in milliseconds'
    })
    const fadeOut = screen.getByRole('spinbutton', {
      name: 'Automatic clip fade-out milliseconds'
    })
    fireEvent.change(fadeIn, { target: { value: '-1' } })
    expect(onSetClipEdgeMicroFades).toHaveBeenLastCalledWith({
      enabled: true,
      fadeInMs: 0,
      fadeOutMs: 4
    })
    fireEvent.change(fadeOut, { target: { value: '21' } })
    expect(onSetClipEdgeMicroFades).toHaveBeenLastCalledWith({
      enabled: true,
      fadeInMs: 2,
      fadeOutMs: 20
    })

    const callCount = onSetClipEdgeMicroFades.mock.calls.length
    fireEvent.change(fadeOut, { target: { value: '' } })
    expect(onSetClipEdgeMicroFades).toHaveBeenCalledTimes(callCount)
  })

  it('disables fade durations when Clip Edge Fades are off', () => {
    const { rerender } = render(
      <SettingsModal
        {...defaultProps}
        clipEdgeMicroFades={{ enabled: false, fadeInMs: 2, fadeOutMs: 4 }}
      />
    )

    expect(screen.getByRole('checkbox', {
      name: 'Enable automatic clip-edge fades'
    })).toBeEnabled()
    expect(screen.getByRole('spinbutton', {
      name: 'Automatic clip fade-in milliseconds'
    })).toBeDisabled()
    rerender(
      <SettingsModal
        {...defaultProps}
        clipEdgeMicroFades={{ enabled: true, fadeInMs: 2, fadeOutMs: 4 }}
      />
    )
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', {
      name: 'Automatic clip fade-out milliseconds'
    })).toBeEnabled()
  })

  it('closes with Escape and restores focus when unmounted', () => {
    const onClose = vi.fn()
    const onRestoreFocus = vi.fn()
    const { unmount } = render(
      <SettingsModal {...defaultProps} onClose={onClose} onRestoreFocus={onRestoreFocus} />
    )

    expect(document.body).toHaveAttribute('data-mixjam-modal-blocking', '1')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(document.body).not.toHaveAttribute('data-mixjam-modal-blocking')
    expect(onRestoreFocus).toHaveBeenCalledOnce()
  })
})
