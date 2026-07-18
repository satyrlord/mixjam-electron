import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MixJamBrowser from './MixJamBrowser'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

describe('MixJamBrowser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem('mixjam:recents-rail-collapsed')
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('requests a controlled collapse state change', () => {
    const onCollapsedChange = vi.fn()
    const { rerender } = render(
      <MixJamBrowser
        mixJamFiles={[]}
        collapsed={false}
        onOpenProject={vi.fn()}
        onCollapsedChange={onCollapsedChange}
      />
    )
    const toggle = screen.getByRole('button', { name: 'Collapse MixJam Browser' })
    fireEvent.click(toggle)
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true)

    rerender(
      <MixJamBrowser
        mixJamFiles={[]}
        collapsed
        onOpenProject={vi.fn()}
        onCollapsedChange={onCollapsedChange}
      />
    )

    expect(screen.getByRole('button', { name: 'Expand MixJam Browser' })).toBeInTheDocument()
  })

  it('notifies the parent once for each collapse state', () => {
    const onCollapsedChange = vi.fn()
    render(
      <MixJamBrowser
        mixJamFiles={[]}
        collapsed={false}
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
        collapsed={false}
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
        collapsed={false}
        onOpenProject={vi.fn()}
      />
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /club/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Path' }))

    expect(writeText).toHaveBeenCalledWith('sets/club.mixjam')
  })
})
