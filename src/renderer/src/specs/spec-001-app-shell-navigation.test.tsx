import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAppIconPath,
  createMainWindowOptions,
  HOME_WINDOW_SIZE,
  resizeWindowToHome,
  resizeWindowToTracker,
  TRACKER_WINDOW_SIZE
} from '../../../shared/window-config'
import App from '../App'
import Header from '../components/Header'

const REPO_ROOT = process.cwd()
const INDEX_CSS_PATH = resolve(REPO_ROOT, 'src/renderer/src/index.css')
const APP_ICON_PATH = resolve(REPO_ROOT, 'public/app-icon.ico')
const GITHUB_URL = 'https://github.com/satyrlord/mixjam-electron'

function readUtf8(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8')
}

async function clickStartNewMixJam(): Promise<void> {
  const start = await screen.findByRole('button', { name: 'Start New MixJam' })
  await waitFor(() => expect(start).toBeEnabled())
  fireEvent.click(start)
}

describe('Spec 001 - App Shell & Navigation acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC-001: app launches in Home at 1280x720 centered with maximize disabled', () => {
    const options = createMainWindowOptions('D:/dev/mixjam-electron/out/preload/index.js', {} as never)

    expect(HOME_WINDOW_SIZE).toEqual({ width: 1280, height: 720 })
    expect(options.width).toBe(1280)
    expect(options.height).toBe(720)
    expect(options.center).toBe(true)
    expect(options.resizable).toBe(false)
    expect(options.maximizable).toBe(false)

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

  it('AC-003: footer is 40px and shows settings/version links on both Home and Player', async () => {
    const css = readUtf8(INDEX_CSS_PATH)

    expect(css).toMatch(/\.header\s*\{[\s\S]*height:\s*40px;/m)
    expect(css).toMatch(/\.footer\s*\{[\s\S]*height:\s*40px;/m)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Select settings folder' })).toBeInTheDocument()

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Select settings folder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
  })

  it('AC-003a: clicking version opens the GitHub URL via electronAPI', async () => {
    render(<App />)

    const versionButton = await screen.findByRole('button', { name: 'v0.test.0' })
    fireEvent.click(versionButton)

    expect(vi.mocked(window.electronAPI.openExternal)).toHaveBeenCalledWith(GITHUB_URL)
  })

  it('AC-004: Start New MixJam switches to Player and requests tracker window resize behavior', async () => {
    const windowControls = {
      setResizable: vi.fn(),
      setMaximizable: vi.fn(),
      setSize: vi.fn(),
      center: vi.fn()
    }

    resizeWindowToTracker(windowControls)

    expect(TRACKER_WINDOW_SIZE).toEqual({ width: 1920, height: 1080 })
    expect(windowControls.setResizable).toHaveBeenCalledWith(true)
    expect(windowControls.setMaximizable).toHaveBeenCalledWith(true)
    expect(windowControls.setSize).toHaveBeenCalledWith(1920, 1080)
    expect(windowControls.center).toHaveBeenCalledTimes(1)

    render(<App />)

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    expect(vi.mocked(window.electronAPI.resizeToTracker)).toHaveBeenCalledTimes(1)
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
        view="tracker"
        timer="00:00.0"
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

  it('AC-007: Load MixJam opens picker; selection moves to Player, cancel stays on Home', async () => {
    vi.mocked(window.electronAPI.openFilePicker).mockResolvedValueOnce('D:/test/project.mixjam')

    const firstRender = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Load MixJam' }))

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    expect(vi.mocked(window.electronAPI.openFilePicker)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(window.electronAPI.resizeToTracker)).toHaveBeenCalledTimes(1)

    firstRender.unmount()

    vi.clearAllMocks()
    vi.mocked(window.electronAPI.openFilePicker).mockResolvedValueOnce(null)

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Load MixJam' }))

    await waitFor(() => {
      expect(vi.mocked(window.electronAPI.openFilePicker)).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    expect(screen.queryByText('Lane 1')).not.toBeInTheDocument()
    expect(vi.mocked(window.electronAPI.resizeToTracker)).not.toHaveBeenCalled()
  })

  it('AC-008: Return to Main Menu restores Home and requests home window resize behavior', async () => {
    const callOrder: string[] = []
    const windowControls = {
      setResizable: vi.fn((value: boolean) => callOrder.push(`setResizable:${String(value)}`)),
      setMaximizable: vi.fn((value: boolean) => callOrder.push(`setMaximizable:${String(value)}`)),
      setSize: vi.fn((width: number, height: number) => callOrder.push(`setSize:${width}x${height}`)),
      center: vi.fn(() => callOrder.push('center'))
    }

    resizeWindowToHome(windowControls)

    expect(callOrder).toEqual([
      'setResizable:true',
      'setSize:1280x720',
      'center',
      'setResizable:false',
      'setMaximizable:false'
    ])

    render(<App />)

    await clickStartNewMixJam()
    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Return to Main Menu/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    })

    expect(vi.mocked(window.electronAPI.resizeToHome)).toHaveBeenCalledTimes(1)
  })

  it('AC-009: roundtrip Home -> Player -> Home -> Player works with no state leak', async () => {
    render(<App />)

    await clickStartNewMixJam()
    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Return to Main Menu/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeInTheDocument()
    })

    await clickStartNewMixJam()
    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    expect(vi.mocked(window.electronAPI.resizeToTracker)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(window.electronAPI.resizeToHome)).toHaveBeenCalledTimes(1)
  })

  it('AC-010: Player content has five labeled shell regions', async () => {
    render(<App />)

    await clickStartNewMixJam()

    const recentProjects = await screen.findByText('Recent Projects')
    const tracker = screen.getByText('Lane 1')
    const middleStrip = screen.getByText('Untitled')
    const songControls = screen.getByText('Song Controls')
    const sampleBrowser = screen.getByRole('region', { name: /sample browser/i })

    expect(recentProjects).toBeInTheDocument()
    expect(tracker).toBeInTheDocument()
    expect(middleStrip).toBeInTheDocument()
    expect(songControls).toBeInTheDocument()
    expect(sampleBrowser).toBeInTheDocument()
  })

  it('AC-011: app root occupies full viewport height with overflow hidden', () => {
    const css = readUtf8(INDEX_CSS_PATH)

    expect(css).toMatch(/html,\s*body\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/m)
    expect(css).toMatch(/#root\s*\{[\s\S]*height:\s*100%;/m)
    expect(css).toMatch(/\.app\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/m)
  })

  it('AC-012: BrowserWindow uses custom icon from public/app-icon.ico', () => {
    const iconPath = buildAppIconPath(resolve(REPO_ROOT, 'out/main'))
    const icon = { kind: 'icon' } as never
    const options = createMainWindowOptions('D:/dev/mixjam-electron/out/preload/index.js', icon)

    expect(existsSync(APP_ICON_PATH)).toBe(true)
    expect(iconPath).toBe(APP_ICON_PATH)
    expect(options.icon).toBe(icon)
  })
})
