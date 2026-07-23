import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAppIconPath,
  createMainWindowOptions,
  HOME_RESIZE_DELAY_MS,
  HOME_WINDOW_SIZE,
  resizeWindowToHome,
  resizeWindowToPlayer,
  PLAYER_WINDOW_SIZE
} from '../../../shared/window-config'
import App from '../App'
import Header from '../components/Header'
import { createValueStore } from '../lib/value-store'

const REPO_ROOT = process.cwd()
const INDEX_CSS_PATH = resolve(REPO_ROOT, 'src/renderer/src/index.css')
const WINDOWS_APP_ICON_PATH = resolve(REPO_ROOT, 'public/app-icon.ico')
const CROSS_PLATFORM_APP_ICON_PATH = resolve(REPO_ROOT, 'public/app-icon-512.png')
const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

function readUtf8(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8')
}

async function clickStartNewMixJam(): Promise<void> {
  await waitFor(() => expect(
    screen.getByRole('button', { name: 'Start New MixJam' })
  ).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))
}

describe('Spec 001 - App Shell & Navigation acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC-001: app launches in Home at 1920x1080 centered with maximize and resize enabled', () => {
    const options = createMainWindowOptions('D:/dev/mixjam-electron/out/preload/index.js', {} as never)

    expect(HOME_WINDOW_SIZE).toEqual({ width: 1920, height: 1080 })
    expect(options.width).toBe(1920)
    expect(options.height).toBe(1080)
    expect(options.useContentSize).toBe(true)
    expect(options.center).toBe(true)
    expect(options.resizable).toBe(true)
    expect(options.maximizable).toBe(true)

    render(<App />)
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    expect(screen.queryByText('Lane 1')).not.toBeInTheDocument()
  })

  it('AC-001a: Home header shows MixJam Electron brand anchored to the left margin', () => {
    const css = readUtf8(INDEX_CSS_PATH)

    render(<App />)

    const header = screen.getByRole('banner')
    expect(within(header).getByText('MixJam Electron')).toBeInTheDocument()
    expect(css).toContain('.header-left {')
    expect(css).toContain('.header-right {')
    expect(css).toContain('margin-left: auto;')
  })

  it('AC-002: Home content shows Start New MixJam and Load MixJam actions', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load MixJam' })).toBeInTheDocument()
  })

  it('AC-003: header and footer are 48px and Player shows Settings plus version', async () => {
    const css = readUtf8(INDEX_CSS_PATH)

    expect(css).toMatch(/\.header\s*\{[\s\S]*height:\s*48px;/m)
    expect(css).toMatch(/\.footer\s*\{[\s\S]*height:\s*48px;/m)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
  })

  it('AC-003c/d: Player Settings is an exclusive modal with the three requested sections', async () => {
    render(<App />)
    await clickStartNewMixJam()
    await waitFor(() => expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Select User Folder' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Zoom Level' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Clip Edge Fades' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', {
      name: 'Enable automatic clip-edge fades'
    })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close Settings' }))
    expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
  })

  it('AC-003a: clicking version opens the GitHub URL via backendAPI', async () => {
    render(<App />)

    const versionButton = await screen.findByRole('button', { name: 'v0.test.0' })
    fireEvent.click(versionButton)

    expect(vi.mocked(window.backendAPI.openExternal)).toHaveBeenCalledWith(GITHUB_URL)
  })

  it('AC-004: Start New MixJam switches to Player and requests Player window resize behavior', async () => {
    const windowControls = {
      setResizable: vi.fn(),
      setMaximizable: vi.fn(),
      setSize: vi.fn(),
      setContentSize: vi.fn(),
      setMinimumSize: vi.fn(),
      getBounds: vi.fn(() => ({ width: 1936, height: 1119 })),
      getContentBounds: vi.fn(() => ({ width: 1920, height: 1080 })),
      center: vi.fn(),
      maximize: vi.fn()
    }

    resizeWindowToPlayer(windowControls)

    expect(PLAYER_WINDOW_SIZE).toEqual({ width: 1920, height: 1080 })
    expect(windowControls.setMinimumSize).toHaveBeenCalledWith(1936, 1119)
    expect(windowControls.setContentSize).toHaveBeenCalledWith(1920, 1080)
    expect(windowControls.setSize).not.toHaveBeenCalled()
    expect(windowControls.center).toHaveBeenCalledTimes(1)
    expect(windowControls.maximize).toHaveBeenCalledTimes(1)

    render(<App />)

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    expect(vi.mocked(window.backendAPI.resizeToPlayer)).toHaveBeenCalledTimes(1)
  })

  it('AC-005: Player header shows home link, brand, and timer', async () => {
    render(<App />)

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Return to Main Menu/ })).toBeInTheDocument()
    })

    expect(screen.getByText('MixJam Electron')).toBeInTheDocument()
    expect(screen.getByText(/^\d{2}:\d{2}\.\d$/)).toBeInTheDocument()
  })

  it('AC-005a: home link is absent in Home and appears only in Player', async () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: /Return to Main Menu/ })).not.toBeInTheDocument()

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Return to Main Menu/ })).toBeInTheDocument()
    })
  })

  it('AC-006: timer is absolutely centered with left 50% and translateX(-50%)', () => {
    const css = readUtf8(INDEX_CSS_PATH)

    expect(css).toMatch(
      /\.header-timer\s*\{[\s\S]*position:\s*absolute;[\s\S]*left:\s*50%;[\s\S]*transform:\s*translateX\(-50%\);/m
    )

    render(
      <Header
        view="player"
        elapsedMsStore={createValueStore(0)}
        theme="emerald"
        onHome={() => {}}
        onThemeChange={() => {}}
      />
    )

    const timer = document.querySelector('.header-timer')
    expect(timer).not.toBeNull()
    expect(timer?.closest('.header-left')).toBeNull()
    expect(timer?.closest('.header-right')).toBeNull()
  })

  it('AC-007: Load MixJam opens the project picker and cancellation stays on Home', async () => {
    render(<App />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Load MixJam' })
    ).toBeEnabled())
    const loadButton = screen.getByRole('button', { name: 'Load MixJam' })
    expect(loadButton).not.toHaveAttribute('title')

    fireEvent.click(loadButton)

    await waitFor(() => expect(vi.mocked(window.backendAPI.openMixJamFile)).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Lane 1')).not.toBeInTheDocument()
  })

  it('AC-008: Return to Main Menu restores Home and requests home window resize behavior', async () => {
    const callOrder: string[] = []
    const windowControls = {
      setResizable: vi.fn((value: boolean) => callOrder.push(`setResizable:${String(value)}`)),
      setMaximizable: vi.fn((value: boolean) => callOrder.push(`setMaximizable:${String(value)}`)),
      setSize: vi.fn((width: number, height: number) => callOrder.push(`setSize:${width}x${height}`)),
      setContentSize: vi.fn((width: number, height: number) => callOrder.push(`setContentSize:${width}x${height}`)),
      center: vi.fn(() => callOrder.push('center')),
      unmaximize: vi.fn(() => callOrder.push('unmaximize')),
      isMaximized: vi.fn(() => false)
    }

    resizeWindowToHome(windowControls)

    expect(callOrder).toEqual([
      'unmaximize',
      'setContentSize:1920x1080',
      'center'
    ])

    render(<App />)

    await clickStartNewMixJam()
    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Return to Main Menu/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    })

    expect(vi.mocked(window.backendAPI.resizeToHome)).toHaveBeenCalledTimes(1)
  })

  it('re-centers after a deferred unmaximize', () => {
    vi.useFakeTimers()
    let unmaximizeListener: (() => void) | undefined
    const windowControls = {
      setResizable: vi.fn(),
      setMaximizable: vi.fn(),
      setSize: vi.fn(),
      setContentSize: vi.fn(),
      setMinimumSize: vi.fn(),
      getBounds: vi.fn(() => ({ width: 1920, height: 1080 })),
      getContentBounds: vi.fn(() => ({ width: 1920, height: 1080 })),
      center: vi.fn(),
      unmaximize: vi.fn(),
      isMaximized: vi.fn(() => true),
      once: vi.fn((event: 'unmaximize', listener: () => void) => {
        expect(event).toBe('unmaximize')
        unmaximizeListener = listener
      })
    }

    resizeWindowToHome(windowControls)
    expect(windowControls.center).not.toHaveBeenCalled()
    expect(windowControls.setMinimumSize).not.toHaveBeenCalled()

    unmaximizeListener?.()
    vi.advanceTimersByTime(HOME_RESIZE_DELAY_MS)
    expect(windowControls.center).toHaveBeenCalledTimes(1)
    expect(windowControls.setMinimumSize).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('AC-009: roundtrip Home -> Player -> Home -> Player works with no state leak', async () => {
    render(<App />)

    await clickStartNewMixJam()
    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Return to Main Menu/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    })

    await clickStartNewMixJam()
    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    expect(vi.mocked(window.backendAPI.resizeToPlayer)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(window.backendAPI.resizeToHome)).toHaveBeenCalledTimes(1)
  })

  it('AC-010: Player content has the upper work, Middle Strip, and Bottom Workspace regions', async () => {
    render(<App />)

    await clickStartNewMixJam()

    // Wait for the Player to mount first: the Home screen also shows a
    // project list, so anchoring on the Tracker avoids grabbing
    // the Home node mid-navigation.
    const tracker = (await screen.findAllByText('Lane 1'))[0]
    const mixJamFiles = screen.getByText('MixJam Browser')
    const middleStrip = screen.getByText('Untitled')
    const bottomWorkspace = screen.getByRole('region', { name: 'Bottom Workspace' })

    expect(mixJamFiles).toBeInTheDocument()
    expect(tracker).toBeInTheDocument()
    expect(middleStrip).toBeInTheDocument()
    expect(bottomWorkspace).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Master', 'Mixer', 'Samples'
    ])
  })

  it('AC-011: app root occupies full viewport height with overflow hidden', () => {
    const css = readUtf8(INDEX_CSS_PATH)

    expect(css).toMatch(/html,\s*body\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/m)
    expect(css).toMatch(/#root\s*\{[\s\S]*height:\s*100%;/m)
    expect(css).toMatch(/\.app\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/m)
  })

  it('AC-012: BrowserWindow uses a platform-decodable custom icon from public', () => {
    const mainOutputPath = resolve(REPO_ROOT, 'out/main')
    const icon = { kind: 'icon' } as never
    const options = createMainWindowOptions('D:/dev/mixjam-electron/out/preload/index.js', icon)

    expect(existsSync(WINDOWS_APP_ICON_PATH)).toBe(true)
    expect(existsSync(CROSS_PLATFORM_APP_ICON_PATH)).toBe(true)
    expect(buildAppIconPath(mainOutputPath, 'win32')).toBe(WINDOWS_APP_ICON_PATH)
    expect(buildAppIconPath(mainOutputPath, 'linux')).toBe(CROSS_PLATFORM_APP_ICON_PATH)
    expect(buildAppIconPath(mainOutputPath, 'darwin')).toBe(CROSS_PLATFORM_APP_ICON_PATH)
    expect(options.icon).toBe(icon)
  })
})
