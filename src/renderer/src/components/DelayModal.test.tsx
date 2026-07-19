import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultDelayReturnModule } from '../engine/return-effects'
import DelayModal from './DelayModal'

describe('DelayModal', () => {
  it('uses accessible sliders, blocks the app, previews, saves, and restores focus', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onPreview = vi.fn()
    const onSave = vi.fn()
    const { unmount } = render(
      <DelayModal
        value={createDefaultDelayReturnModule('fx-1')}
        powered
        onCancel={vi.fn()}
        onSave={onSave}
        onPreview={onPreview}
        onRestoreFocus={() => opener.focus()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Delay' })
    expect(dialog).toHaveFocus()
    expect(document.body.dataset.mixjamModalBlocking).toBe('1')
    expect(screen.getByRole('slider', { name: 'Free time' })).toHaveAttribute('aria-valuetext', '375 ms')
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Free time' }), { key: 'ArrowUp' })
    fireEvent.keyDown(dialog, { key: ' ' })
    fireEvent.keyDown(dialog, { key: 'Enter' })

    expect(onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeMs: 385 }),
      false
    )
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeMs: 385 }), false)

    unmount()
    expect(document.body.dataset.mixjamModalBlocking).toBeUndefined()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('supports focused reset, full Reset, and non-dismissable outside interaction', () => {
    const onCancel = vi.fn()
    const onPreview = vi.fn()
    render(
      <DelayModal
        value={{ ...createDefaultDelayReturnModule('fx-2'), feedback: 70, pingPong: true }}
        powered={false}
        onCancel={onCancel}
        onSave={vi.fn()}
        onPreview={onPreview}
      />
    )

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Feedback' }), { key: 'Backspace' })
    expect(onPreview).toHaveBeenLastCalledWith(expect.objectContaining({ feedback: 35 }), false)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ feedback: 35, pingPong: false }),
      true
    )
    fireEvent.pointerDown(document.querySelector('.mixjam-dialog-overlay')!)
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Delay' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('supports arrow selection for mode, division, and Ping-Pong', () => {
    const onPreview = vi.fn()
    render(
      <DelayModal
        value={createDefaultDelayReturnModule('fx-3')}
        powered
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onPreview={onPreview}
      />
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Free' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sync division' }), { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Off' }), { key: 'ArrowRight' })
    expect(onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'sync', noteDivision: '1/4', pingPong: true }),
      true
    )
  })
})
