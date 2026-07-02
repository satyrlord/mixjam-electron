import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomeScreen from './HomeScreen'
import type { FolderView } from '../hooks/useFolderSession'
import type { RecentProjectItem } from '../../../shared/ipc'

const SET_FOLDER: FolderView = {
  status: 'set',
  path: 'C:/Users/test/MixJam'
}

const UNSET_FOLDER: FolderView = {
  status: 'empty',
  path: null
}

const RECENT_PROJECTS: RecentProjectItem[] = [
  {
    path: 'C:/Users/test/MixJam/club-night.mixjam',
    displayName: 'club-night',
    lastOpened: '2026-06-28T12:00:00.000Z'
  },
  {
    path: 'C:/Users/test/MixJam/ambient-set.mixjam',
    displayName: 'ambient-set',
    lastOpened: '2026-06-27T12:00:00.000Z'
  }
]

describe('HomeScreen', () => {
  it('renders start button disabled when canStart is false', () => {
    render(
      <HomeScreen
        userFolder={SET_FOLDER}
        sampleFolder={UNSET_FOLDER}
        canStart={false}
        recentProjects={[]}
        activeTheme="emerald"
        onThemeChange={vi.fn()}
        onOpenRecentProject={vi.fn()}
        onPickUser={vi.fn()}
        onPickSample={vi.fn()}
        onStart={vi.fn()}
        onLoad={vi.fn()}
      />
    )

    const btn = screen.getByRole('button', { name: 'Start New MixJam' })
    expect(btn).toBeTruthy()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onStart when Start New MixJam is clicked and canStart is true', () => {
    const onStart = vi.fn()
    render(
      <HomeScreen
        userFolder={SET_FOLDER}
        sampleFolder={SET_FOLDER}
        canStart={true}
        recentProjects={[]}
        activeTheme="emerald"
        onThemeChange={vi.fn()}
        onOpenRecentProject={vi.fn()}
        onPickUser={vi.fn()}
        onPickSample={vi.fn()}
        onStart={onStart}
        onLoad={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('calls onThemeChange when a theme swatch is clicked', () => {
    const onThemeChange = vi.fn()
    render(
      <HomeScreen
        userFolder={SET_FOLDER}
        sampleFolder={SET_FOLDER}
        canStart={true}
        recentProjects={[]}
        activeTheme="emerald"
        onThemeChange={onThemeChange}
        onOpenRecentProject={vi.fn()}
        onPickUser={vi.fn()}
        onPickSample={vi.fn()}
        onStart={vi.fn()}
        onLoad={vi.fn()}
      />
    )

    // Click a non-active theme swatch
    const swatch = screen.getByLabelText('Switch to Rust Industrial theme')
    fireEvent.click(swatch)
    expect(onThemeChange).toHaveBeenCalledWith('rust')
  })

  it('renders recent projects when provided', () => {
    render(
      <HomeScreen
        userFolder={SET_FOLDER}
        sampleFolder={SET_FOLDER}
        canStart={true}
        recentProjects={RECENT_PROJECTS}
        activeTheme="emerald"
        onThemeChange={vi.fn()}
        onOpenRecentProject={vi.fn()}
        onPickUser={vi.fn()}
        onPickSample={vi.fn()}
        onStart={vi.fn()}
        onLoad={vi.fn()}
      />
    )

    expect(screen.getByText('club-night')).toBeTruthy()
    expect(screen.getByText('ambient-set')).toBeTruthy()
  })

  it('calls onOpenRecentProject when a recent project is clicked', () => {
    const onOpenRecentProject = vi.fn()
    render(
      <HomeScreen
        userFolder={SET_FOLDER}
        sampleFolder={SET_FOLDER}
        canStart={true}
        recentProjects={RECENT_PROJECTS}
        activeTheme="emerald"
        onThemeChange={vi.fn()}
        onOpenRecentProject={onOpenRecentProject}
        onPickUser={vi.fn()}
        onPickSample={vi.fn()}
        onStart={vi.fn()}
        onLoad={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('club-night'))
    expect(onOpenRecentProject).toHaveBeenCalledWith(RECENT_PROJECTS[0])
  })

  it('shows only up to 4 recent projects', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      path: `C:/proj-${i}.mixjam`,
      displayName: `project-${i}`,
      lastOpened: '2026-01-01T00:00:00.000Z'
    }))

    render(
      <HomeScreen
        userFolder={SET_FOLDER}
        sampleFolder={SET_FOLDER}
        canStart={true}
        recentProjects={many}
        activeTheme="emerald"
        onThemeChange={vi.fn()}
        onOpenRecentProject={vi.fn()}
        onPickUser={vi.fn()}
        onPickSample={vi.fn()}
        onStart={vi.fn()}
        onLoad={vi.fn()}
      />
    )

    expect(screen.getByText('project-0')).toBeTruthy()
    expect(screen.getByText('project-3')).toBeTruthy()
    expect(screen.queryByText('project-4')).toBeNull()
  })
})
