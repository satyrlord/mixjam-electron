import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadPlayerWorkspacePreferences,
  playerWorkspacePreferences
} from './player-workspace-preferences'

describe('player workspace preferences', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads validated defaults and migrates the legacy browser width', () => {
    localStorage.setItem('mixjam-left-col-w', '320')

    const preferences = loadPlayerWorkspacePreferences(1600, 200)

    expect(preferences.upperLayout).toEqual({ browser: 20, tracker: 80 })
    expect(preferences.verticalLayout).toEqual({ upper: 76, bottom: 24 })
    expect(preferences.bottomTab).toBe('song')
    expect(preferences.bottomExpansion).toEqual({ expanded: false, previousBottomSize: 24 })
    expect(preferences.mixJamBrowserCollapsed).toBe(false)
  })

  it('rejects malformed layouts and expansion state', () => {
    localStorage.setItem('mixjam:upper-work-layout', JSON.stringify({ browser: 20, other: 80 }))
    localStorage.setItem('mixjam:bottom-workspace-layout-v2', '{bad json')
    localStorage.setItem('mixjam:bottom-workspace-expansion-v2', JSON.stringify({
      expanded: true,
      previousBottomSize: 101
    }))
    localStorage.setItem('mixjam:bottom-workspace-tab', 'unknown')

    const preferences = loadPlayerWorkspacePreferences(1000, 200)

    expect(preferences.upperLayout).toEqual({ browser: 18, tracker: 82 })
    expect(preferences.verticalLayout).toEqual({ upper: 76, bottom: 24 })
    expect(preferences.bottomExpansion).toEqual({ expanded: false, previousBottomSize: 24 })
    expect(preferences.bottomTab).toBe('song')
  })

  it('owns every workspace storage write and tolerates unavailable storage', () => {
    playerWorkspacePreferences.saveUpperLayout({ browser: 25, tracker: 75 })
    playerWorkspacePreferences.saveVerticalLayout({ upper: 60, bottom: 40 })
    playerWorkspacePreferences.saveBottomExpansion({ expanded: true, previousBottomSize: 40 })
    playerWorkspacePreferences.saveBottomTab('samples')
    playerWorkspacePreferences.saveMixJamBrowserCollapsed(true)

    expect(loadPlayerWorkspacePreferences(1000, 200)).toMatchObject({
      upperLayout: { browser: 25, tracker: 75 },
      verticalLayout: { upper: 60, bottom: 40 },
      bottomExpansion: { expanded: true, previousBottomSize: 40 },
      bottomTab: 'samples',
      mixJamBrowserCollapsed: true
    })

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked') })
    expect(() => playerWorkspacePreferences.saveBottomTab('mixer')).not.toThrow()
    expect(loadPlayerWorkspacePreferences(1000, 200).bottomTab).toBe('song')
  })
})
