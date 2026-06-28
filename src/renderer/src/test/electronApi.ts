import { vi } from 'vitest'
import type { ElectronAPI, RecentProjectItem, SampleBrowserItem } from '../../../shared/ipc'

const DEFAULT_SESSION = { userFolder: 'C:/Users/test/MixJam', sampleFolder: 'C:/Samples' }
const DEFAULT_RECENT_PROJECTS: RecentProjectItem[] = [
  {
    path: 'c:/users/test/mixjam/club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  },
  {
    path: 'c:/users/test/mixjam/archive/sunrise.mixjam',
    displayName: 'sunrise',
    lastOpened: null
  }
]

const DEFAULT_SAMPLE_BROWSER_ITEMS: SampleBrowserItem[] = [
  {
    id: 'sample-kick-808',
    name: 'kick_808.wav',
    path: 'Drums/Kicks/kick_808.wav',
    category: 'Drums',
    duration: '--',
    metadata: ['44.1 kHz', 'Stereo', '52.0 KB'],
    tags: ['Drums', 'Kick', '808']
  },
  {
    id: 'sample-snare-clap',
    name: 'snare_clap.wav',
    path: 'Drums/Snares/snare_clap.wav',
    category: 'Drums',
    duration: '--',
    metadata: ['44.1 kHz', 'Stereo', '49.0 KB'],
    tags: ['Drums', 'Snare', 'Clap']
  }
]

export function createElectronAPI(): ElectronAPI {
  return {
    getVersion: vi.fn().mockResolvedValue('v0.test.0'),
    resizeToTracker: vi.fn().mockResolvedValue(undefined),
    resizeToHome: vi.fn().mockResolvedValue(undefined),
    openFilePicker: vi.fn().mockResolvedValue(null),
    openFolderPicker: vi.fn().mockResolvedValue(null),
    openExternal: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(DEFAULT_SESSION),
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadRecentProjects: vi.fn().mockResolvedValue(DEFAULT_RECENT_PROJECTS),
    recordRecentProject: vi.fn().mockResolvedValue(undefined),
    querySampleBrowser: vi.fn().mockImplementation(async (_sampleFolder, searchQuery: string) => {
      const query = searchQuery.trim().toLowerCase()
      if (!query) return DEFAULT_SAMPLE_BROWSER_ITEMS
      return DEFAULT_SAMPLE_BROWSER_ITEMS.filter((item) =>
        `${item.name} ${item.path}`.toLowerCase().includes(query)
      )
    }),
    pickFolder: vi.fn().mockResolvedValue(null),
    validateFolder: vi.fn().mockResolvedValue(true)
  }
}
