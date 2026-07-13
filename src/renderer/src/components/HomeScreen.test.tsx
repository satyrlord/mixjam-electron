import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomeScreen from './HomeScreen'
import type { FolderView } from '../hooks/useFolderSetup'
import type { MixJamFileItem } from '../../../shared/backend-api'

const SET_FOLDER: FolderView = {
  status: 'set',
  ref: { id: 'test-user-folder', name: 'MixJam' }
}

const UNSET_FOLDER: FolderView = {
  status: 'empty',
  ref: null
}

const RECENT_PROJECTS: MixJamFileItem[] = [
  {
    path: 'club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  },
  {
    path: 'ambient-set.mixjam',
    displayName: 'ambient-set',
    lastOpened: '2026-06-27T12:00:00.000Z'
  }
]

function renderHome(overrides: Partial<Parameters<typeof HomeScreen>[0]> = {}) {
  return render(
    <HomeScreen
      userFolder={SET_FOLDER}
      sampleFolder={SET_FOLDER}
      canStart={true}
      mixJamFiles={[]}
      projectBusy={false}
      activeTheme="emerald"
      onThemeChange={vi.fn()}
      onPickUser={vi.fn()}
      onPickSample={vi.fn()}
      onRestoreUser={vi.fn()}
      onRestoreSample={vi.fn()}
      onStart={vi.fn()}
      onLoad={vi.fn()}
      onOpenProject={vi.fn()}
      {...overrides}
    />
  )
}

describe('HomeScreen', () => {
  it('renders start button disabled when canStart is false', () => {
    renderHome({ sampleFolder: UNSET_FOLDER, canStart: false })

    const btn = screen.getByRole('button', { name: 'Start New MixJam' })
    expect(btn).toBeTruthy()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onStart when Start New MixJam is clicked and canStart is true', () => {
    const onStart = vi.fn()
    renderHome({ onStart })

    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('calls onThemeChange when a theme swatch is clicked', () => {
    const onThemeChange = vi.fn()
    renderHome({ onThemeChange })

    const swatch = screen.getByLabelText('Switch to Rust Industrial theme')
    fireEvent.click(swatch)
    expect(onThemeChange).toHaveBeenCalledWith('rust')
  })

  it('renders recent projects when provided', () => {
    renderHome({ mixJamFiles: RECENT_PROJECTS })

    expect(screen.getByText('club-night')).toBeTruthy()
    expect(screen.getByText('ambient-set')).toBeTruthy()
  })

  it('opens the native project picker and recent project entries', () => {
    const onLoad = vi.fn()
    const onOpenProject = vi.fn()
    renderHome({ mixJamFiles: RECENT_PROJECTS, onLoad, onOpenProject })

    const loadButton = screen.getByRole('button', { name: 'Load MixJam' })
    expect(loadButton).toBeEnabled()
    fireEvent.click(loadButton)
    expect(onLoad).toHaveBeenCalledTimes(1)

    const recentEntry = screen.getByText('club-night').closest('button')!
    expect(recentEntry).toBeEnabled()
    fireEvent.click(recentEntry)
    expect(onOpenProject).toHaveBeenCalledWith('club-night.mixjam')
  })

  it('disables project actions while a project operation is busy', () => {
    renderHome({ mixJamFiles: RECENT_PROJECTS, projectBusy: true })

    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Opening…' })).toBeDisabled()
    expect(screen.getByText('club-night').closest('button')).toBeDisabled()
  })

  it('shows only up to 4 recent projects', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      path: `proj-${i}.mixjam`,
      displayName: `project-${i}`,
      lastOpened: '2026-01-01T00:00:00.000Z'
    }))

    renderHome({ mixJamFiles: many })

    expect(screen.getByText('project-0')).toBeTruthy()
    expect(screen.getByText('project-3')).toBeTruthy()
    expect(screen.queryByText('project-4')).toBeNull()
  })
})
