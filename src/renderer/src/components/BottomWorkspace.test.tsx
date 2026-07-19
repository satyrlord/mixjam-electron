import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBottomWorkspace } from './BottomWorkspace'

const preferenceSpies = vi.hoisted(() => ({
  saveUpperLayout: vi.fn(),
  saveVerticalLayout: vi.fn(),
  saveBottomExpansion: vi.fn(),
  saveBottomTab: vi.fn(),
  saveBottomTabSizes: vi.fn(),
  saveMixJamBrowserCollapsed: vi.fn()
}))

vi.mock('../app-state/player-workspace-preferences', () => ({
  BOTTOM_WORKSPACE_TABS: ['song', 'mixer', 'samples'] as const,
  loadPlayerWorkspacePreferences: () => ({
    upperLayout: { browser: 18, tracker: 82 },
    verticalLayout: { upper: 76, bottom: 24 },
    bottomTab: 'song',
    bottomTabSizes: { song: 24, mixer: 60, samples: 24 },
    bottomExpansion: { expanded: false, previousBottomSize: 24 },
    mixJamBrowserCollapsed: false
  }),
  playerWorkspacePreferences: preferenceSpies
}))

function createPanel(size = 34) {
  return {
    collapse: vi.fn(),
    expand: vi.fn(),
    getSize: vi.fn(() => ({ asPercentage: size, inPixels: size * 10 })),
    resize: vi.fn()
  }
}

describe('useBottomWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('remembers each tab size and enforces the mixer minimum height', () => {
    const { result } = renderHook(() => useBottomWorkspace())
    const panel = createPanel()
    Object.defineProperty(result.current.bottomPanelRef, 'current', { value: panel, configurable: true })

    act(() => result.current.setBottomTab('mixer'))

    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenCalledWith({
      song: 34,
      mixer: 60,
      samples: 24
    })
    expect(preferenceSpies.saveBottomTab).toHaveBeenCalledWith('mixer')
    expect(panel.resize).toHaveBeenLastCalledWith(
      `${Math.max(result.current.mixerMinimumHeight, 600)}px`
    )

    const saveCount = preferenceSpies.saveBottomTab.mock.calls.length
    act(() => result.current.setBottomTab('mixer'))
    expect(preferenceSpies.saveBottomTab).toHaveBeenCalledTimes(saveCount)

    act(() => result.current.openSamples())
    expect(result.current.bottomTab).toBe('samples')
    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenCalledWith({
      song: 34,
      mixer: 34,
      samples: 50
    })
    expect(panel.resize).toHaveBeenLastCalledWith('50%')
  })

  it('expands and restores the panel using the captured size', () => {
    const { result } = renderHook(() => useBottomWorkspace())
    const panel = createPanel(37)
    Object.defineProperty(result.current.bottomPanelRef, 'current', { value: panel, configurable: true })

    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(true)
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenLastCalledWith({
      expanded: true,
      previousBottomSize: 37
    })
    expect(panel.resize).toHaveBeenLastCalledWith('60%')

    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(false)
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenLastCalledWith({
      expanded: false,
      previousBottomSize: 37
    })
    expect(panel.resize).toHaveBeenLastCalledWith('37%')
  })

  it('handles an unattached panel and distinguishes programmatic from user resizing', () => {
    const { result } = renderHook(() => useBottomWorkspace())

    act(() => {
      result.current.setBottomTab('samples')
      result.current.toggleExpanded()
    })
    expect(result.current.bottomTab).toBe('samples')
    expect(result.current.expanded).toBe(false)

    act(() => result.current.onVerticalLayoutChanged({ upper: 70 }, { isUserInteraction: true }))
    expect(preferenceSpies.saveVerticalLayout).toHaveBeenLastCalledWith({ upper: 70 })
    expect(preferenceSpies.saveBottomExpansion).not.toHaveBeenCalled()

    act(() => result.current.onVerticalLayoutChanged(
      { upper: 66, bottom: 34 },
      { isUserInteraction: false }
    ))
    expect(preferenceSpies.saveBottomExpansion).not.toHaveBeenCalled()

    act(() => result.current.onVerticalLayoutChanged(
      { upper: 62, bottom: 38 },
      { isUserInteraction: true }
    ))
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenLastCalledWith({
      expanded: false,
      previousBottomSize: 38
    })

    act(() => result.current.setBottomTab('mixer'))
    const expansionSaveCount = preferenceSpies.saveBottomExpansion.mock.calls.length
    act(() => result.current.onVerticalLayoutChanged(
      { upper: 55, bottom: 45 },
      { isUserInteraction: true }
    ))
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenCalledTimes(expansionSaveCount)
  })

  it('keeps the browser panel and stored collapsed preference in sync', () => {
    const { result } = renderHook(() => useBottomWorkspace())
    const panel = createPanel()
    Object.defineProperty(result.current.browserPanelRef, 'current', { value: panel, configurable: true })

    act(() => result.current.onBrowserCollapsedChange(true))
    expect(result.current.mixJamBrowserCollapsed).toBe(true)
    expect(panel.collapse).toHaveBeenCalledOnce()
    expect(preferenceSpies.saveMixJamBrowserCollapsed).toHaveBeenLastCalledWith(true)

    act(() => result.current.onBrowserCollapsedChange(false))
    expect(result.current.mixJamBrowserCollapsed).toBe(false)
    expect(panel.expand).toHaveBeenCalledOnce()
    expect(preferenceSpies.saveMixJamBrowserCollapsed).toHaveBeenLastCalledWith(false)
  })
})
