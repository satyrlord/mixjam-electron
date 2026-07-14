import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MixJamBrowser from './MixJamBrowser'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

describe('MixJamBrowser storage failures', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem('mixjam:recents-rail-collapsed')
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('keeps collapse state usable when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    render(<MixJamBrowser mixJamFiles={[]} onOpenProject={vi.fn()} />)
    const toggle = screen.getByRole('button', { name: 'Collapse MixJam Browser' })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Expand MixJam Browser' })).toBeInTheDocument()
  })

  it('notifies the parent once for each collapse state', () => {
    const onCollapsedChange = vi.fn()
    render(
      <MixJamBrowser
        mixJamFiles={[]}
        onOpenProject={vi.fn()}
        onCollapsedChange={onCollapsedChange}
      />
    )

    expect(onCollapsedChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse MixJam Browser' }))

    expect(onCollapsedChange.mock.calls).toEqual([[false], [true]])
  })

  it('opens a project from its context menu', () => {
    const onOpenProject = vi.fn()
    render(
      <MixJamBrowser
        mixJamFiles={[{ path: 'sets/club.mixjam', displayName: 'Club', lastOpened: null }]}
        onOpenProject={onOpenProject}
      />
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /club/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }))

    expect(onOpenProject).toHaveBeenCalledWith('sets/club.mixjam')
  })

  it('copies a project path from its context menu', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    render(
      <MixJamBrowser
        mixJamFiles={[{ path: 'sets/club.mixjam', displayName: 'Club', lastOpened: null }]}
        onOpenProject={vi.fn()}
      />
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /club/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Path' }))

    expect(writeText).toHaveBeenCalledWith('sets/club.mixjam')
  })
})
