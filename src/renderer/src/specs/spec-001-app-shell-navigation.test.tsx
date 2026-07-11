import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAppIconPath,
  createMainWindowOptions,
  HOME_WINDOW_SIZE,
  resizeWindowToHome,
  resizeWindowToPlayer,
  PLAYER_WINDOW_SIZE
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
    expect(screen.getByRole('button', { name: 'Select User Folder' })).toBeInTheDocument()

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Select User Folder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'v0.test.0' })).toBeInTheDocument()
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
      center: vi.fn()
    }

    resizeWindowToPlayer(windowControls)

    expect(PLAYER_WINDOW_SIZE).toEqual({ width: 1920, height: 1080 })
    expect(windowControls.setResizable).toHaveBeenCalledWith(true)
    expect(windowControls.setMaximizable).toHaveBeenCalledWith(true)
    expect(windowControls.setSize).toHaveBeenCalledWith(1920, 1080)
    expect(windowControls.center).toHaveBeenCalledTimes(1)

    render(<App />)

    await clickStartNewMixJam()

    await waitFor(() => {
      expect(screen.getByText('Lane 1')).toBeInTheDocument()
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

  it('AC-007: Load MixJam is disabled with a coming-soon hint until spec-011 ships', () => {
    render(<App />)

    const loadButton = screen.getByRole('button', { name: 'Load MixJam' })
    expect(loadButton).toBeDisabled()
    expect(loadButton).toHaveAttribute('title', expect.stringMatching(/coming soon/i))

    fireEvent.click(loadButton)

    expect(screen.queryByText('Lane 1')).not.toBeInTheDocument()
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

    expect(vi.mocked(window.backendAPI.resizeToHome)).toHaveBeenCalledTimes(1)
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

    expect(vi.mocked(window.backendAPI.resizeToPlayer)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(window.backendAPI.resizeToHome)).toHaveBeenCalledTimes(1)
  })

  it('AC-010: Player content has the upper work, Middle Strip, and Bottom Workspace regions', async () => {
    render(<App />)

    await clickStartNewMixJam()

    // Wait for the Player to mount first: the Home screen also shows a
    // project list, so anchoring on the Tracker avoids grabbing
    // the Home node mid-navigation.
    const tracker = await screen.findByText('Lane 1')
    const mixJamFiles = screen.getByText('MixJam Browser')
    const middleStrip = screen.getByText('Untitled')
    const bottomWorkspace = screen.getByRole('region', { name: 'Bottom Workspace' })

    expect(mixJamFiles).toBeInTheDocument()
    expect(tracker).toBeInTheDocument()
    expect(middleStrip).toBeInTheDocument()
    expect(bottomWorkspace).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Song', 'Mixer', 'FX', 'Samples'
    ])
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
