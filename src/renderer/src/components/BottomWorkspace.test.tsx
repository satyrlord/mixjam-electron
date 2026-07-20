import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bottomWorkspaceMinimumHeights, useBottomWorkspace } from './BottomWorkspace'
import { UI_GEOMETRY } from '../ui-size'

const preferenceSpies = vi.hoisted(() => ({
  saveUpperLayout: vi.fn(),
  saveVerticalLayout: vi.fn(),
  saveBottomExpansion: vi.fn(),
  saveBottomTab: vi.fn(),
  saveBottomTabSizes: vi.fn(),
  saveMixJamBrowserCollapsed: vi.fn()
}))

vi.mock('../app-state/player-workspace-preferences', () => ({
  BOTTOM_WORKSPACE_TABS: ['master', 'mixer', 'samples'] as const,
  loadPlayerWorkspacePreferences: () => ({
    upperLayout: { browser: 18, tracker: 82 },
    verticalLayout: { upper: 76, bottom: 24 },
    bottomTab: 'master',
    bottomTabSizes: { master: 24, mixer: 60, samples: 24 },
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

  it('derives a content-safe minimum for every tab and UI Size', () => {
    // Master budgets the 420px Master Bus Strip rack plus its preset chip
    // header and paddings (spec-012).
    expect(bottomWorkspaceMinimumHeights(UI_GEOMETRY[30])).toEqual({
      master: 554,
      mixer: 378,
      samples: 136
    })
    expect(bottomWorkspaceMinimumHeights(UI_GEOMETRY[40])).toEqual({
      master: 601,
      mixer: 500,
      samples: 183
    })
    expect(bottomWorkspaceMinimumHeights(UI_GEOMETRY[50])).toEqual({
      master: 641,
      mixer: 620,
      samples: 225
    })
  })

  it('remembers each tab size and restores every tab above its minimum height', async () => {
    const { result } = renderHook(() => useBottomWorkspace())
    const panel = createPanel()
    Object.defineProperty(result.current.bottomPanelRef, 'current', { value: panel, configurable: true })

    act(() => result.current.onVerticalLayoutChanged(
      { upper: 66, bottom: 34 },
      { isUserInteraction: true }
    ))
    act(() => result.current.setBottomTab('mixer'))

    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenCalledWith({
      master: 34,
      mixer: 60,
      samples: 24
    })
    expect(preferenceSpies.saveBottomTab).toHaveBeenCalledWith('mixer')
    await waitFor(() => expect(panel.resize).toHaveBeenLastCalledWith('600px'))

    const saveCount = preferenceSpies.saveBottomTab.mock.calls.length
    act(() => result.current.setBottomTab('mixer'))
    expect(preferenceSpies.saveBottomTab).toHaveBeenCalledTimes(saveCount)

    act(() => result.current.onVerticalLayoutChanged(
      { upper: 58, bottom: 42 },
      { isUserInteraction: true }
    ))
    act(() => result.current.openSamples())
    expect(result.current.bottomTab).toBe('samples')
    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenCalledWith({
      master: 34,
      mixer: 42,
      samples: 50
    })
    await waitFor(() => expect(panel.resize).toHaveBeenLastCalledWith('500px'))

    act(() => result.current.setBottomTab('master'))
    // The remembered 34% (340px) sits under the Master rack minimum at UI
    // Size 40, so the restore clamps to the content-safe height.
    await waitFor(() => expect(panel.resize).toHaveBeenLastCalledWith('601px'))
  })

  it('clamps an undersized restored tab and an unmeasured panel to pixels', async () => {
    const { result } = renderHook(() => useBottomWorkspace())
    const panel = createPanel(20)
    Object.defineProperty(result.current.bottomPanelRef, 'current', { value: panel, configurable: true })

    act(() => result.current.setBottomTab('mixer'))
    act(() => result.current.setBottomTab('master'))
    await waitFor(() => expect(panel.resize).toHaveBeenLastCalledWith(
      `${result.current.bottomMinimumHeights.master}px`
    ))

    panel.getSize.mockReturnValue({ asPercentage: 0, inPixels: 0 })
    act(() => result.current.setBottomTab('samples'))
    await waitFor(() => expect(panel.resize).toHaveBeenLastCalledWith(
      `${result.current.bottomMinimumHeights.samples}px`
    ))
  })

  it('persists expansion and restoration with the captured Samples size', async () => {
    const { result } = renderHook(() => useBottomWorkspace())
    const panel = createPanel(37)
    Object.defineProperty(result.current.bottomPanelRef, 'current', { value: panel, configurable: true })

    act(() => result.current.setBottomTab('samples'))
    await waitFor(() => expect(panel.resize).toHaveBeenCalled())
    vi.clearAllMocks()

    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(true)
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenLastCalledWith({
      expanded: true,
      previousBottomSize: 37
    })
    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenLastCalledWith({
      master: 24,
      mixer: 60,
      samples: 60
    })
    expect(panel.resize).toHaveBeenLastCalledWith('600px')

    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(false)
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenLastCalledWith({
      expanded: false,
      previousBottomSize: 37
    })
    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenLastCalledWith({
      master: 24,
      mixer: 60,
      samples: 37
    })
    expect(panel.resize).toHaveBeenLastCalledWith('370px')
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
    expect(preferenceSpies.saveBottomTabSizes).not.toHaveBeenCalled()

    act(() => result.current.onVerticalLayoutChanged(
      { upper: 62, bottom: 38 },
      { isUserInteraction: true }
    ))
    expect(preferenceSpies.saveBottomExpansion).toHaveBeenLastCalledWith({
      expanded: false,
      previousBottomSize: 38
    })
    expect(preferenceSpies.saveBottomTabSizes).toHaveBeenLastCalledWith({
      master: 24,
      mixer: 60,
      samples: 38
    })

    act(() => result.current.setBottomTab('master'))
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
