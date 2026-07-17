import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomeScreen from './HomeScreen'
import type { FolderView } from '../hooks/useFolderSetup'
import type { MixJamFileItem, MixJamGeneratorReadiness } from '../../../shared/backend-api'

const SET_FOLDER: FolderView = {
  status: 'set',
  ref: { id: 'test-user-folder', name: 'MixJam' }
}

const UNSET_FOLDER: FolderView = {
  status: 'empty',
  ref: null
}

const SAMPLE_FOLDER_NEEDS_PERMISSION: FolderView = {
  status: 'needs-permission',
  ref: { id: 'test-sample-folder', name: 'Samples' }
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
      librarySyncState={{
        status: 'ready',
        rootKey: 'test-user-folder',
        lastCompletedAt: 1
      }}
      generatorReadiness={{ status: 'ready', detectedBpm: 140, eligibleSamples: 2 }}
      canStart={true}
      mixJamFiles={[]}
      projectBusy={false}
      activeTheme="emerald"
      onThemeChange={vi.fn()}
      onPickUser={vi.fn()}
      onPickSample={vi.fn()}
      onRestoreUser={vi.fn()}
      onRestoreSample={vi.fn()}
      onRetryLibrarySync={vi.fn()}
      onCancelLibrarySync={vi.fn()}
      onStart={vi.fn()}
      onLoad={vi.fn()}
      onOpenProject={vi.fn()}
      {...overrides}
    />
  )
}

describe('HomeScreen', () => {
  it('uses the app icon as the Home logo', () => {
    renderHome()

    const logo = screen.getByRole('img', { name: 'MixJam logo' })
    expect(logo.getAttribute('src')).toContain('app-icon-128.png')
    expect(document.querySelector('.brand-mark')).toBeNull()
  })

  it('renders start button disabled when canStart is false', () => {
    const { container } = renderHome({
      sampleFolder: UNSET_FOLDER,
      librarySyncState: { status: 'unavailable' },
      canStart: false
    })

    const btn = screen.getByRole('button', { name: 'Start New MixJam' })
    expect(btn).toBeTruthy()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('.folder-card-detail')).toBeNull()
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

  it('shows the generator when the sample folder is set and gates it on readiness', () => {
    const onOpenGenerator = vi.fn()
    const { rerender } = renderHome({ onOpenGenerator })
    fireEvent.click(screen.getByRole('button', { name: 'Generate MixJam' }))
    expect(onOpenGenerator).toHaveBeenCalledOnce()

    const busy: MixJamGeneratorReadiness = { status: 'preparing', message: 'Scanning library' }
    rerender(<HomeScreen
      userFolder={SET_FOLDER}
      sampleFolder={SET_FOLDER}
      librarySyncState={{ status: 'ready', rootKey: 'test-user-folder', lastCompletedAt: 1 }}
      generatorReadiness={busy}
      canStart mixJamFiles={[]} projectBusy={false} activeTheme="emerald"
      onThemeChange={vi.fn()} onPickUser={vi.fn()} onPickSample={vi.fn()}
      onRestoreUser={vi.fn()} onRestoreSample={vi.fn()} onRetryLibrarySync={vi.fn()}
      onCancelLibrarySync={vi.fn()} onStart={vi.fn()} onLoad={vi.fn()}
      onOpenProject={vi.fn()} onOpenGenerator={onOpenGenerator}
    />)
    expect(screen.getByRole('button', { name: 'Preparing library…' })).toBeDisabled()
    expect(screen.getByText('Scanning library')).toBeInTheDocument()
    expect(screen.queryByText('Wait for library preparation to finish.')).toBeNull()
  })

  it('offers Prepare library when the generator reports needs-preparation', () => {
    const onRetryLibrarySync = vi.fn()
    renderHome({
      generatorReadiness: { status: 'needs-preparation', message: 'Library needs analysis' },
      onRetryLibrarySync
    })
    expect(screen.getByText('Library needs analysis')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare library' }))
    expect(onRetryLibrarySync).toHaveBeenCalledOnce()
  })

  it('explains when the User Folder blocks generation', () => {
    renderHome({
      userFolder: UNSET_FOLDER,
      canStart: false
    })

    expect(screen.getByRole('button', { name: 'Generate MixJam' })).toBeDisabled()
    expect(screen.getByText('Select an accessible User Folder before generating.')).toBeInTheDocument()
  })

  it.each([
    'No analyzed samples are available for generation.',
    'The Sample Folder is unavailable. Restore access before generating.'
  ])('shows the specific generator prerequisite: %s', (message) => {
    renderHome({
      generatorReadiness: { status: 'needs-preparation', message }
    })

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText('Wait for library preparation to finish.')).toBeNull()
  })

  it('keeps the generator recovery visible when the Sample Folder needs permission', () => {
    const onRestoreSample = vi.fn()
    renderHome({
      sampleFolder: SAMPLE_FOLDER_NEEDS_PERMISSION,
      generatorReadiness: null,
      canStart: false,
      onRestoreSample
    })

    expect(screen.getByText('Restore access to the Sample Folder before generating.'))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore Sample Folder' }))
    expect(onRestoreSample).toHaveBeenCalledOnce()
  })

  it('keeps Home theme previews without repeating the selected theme name', () => {
    renderHome({ activeTheme: 'enterprise' })

    expect(screen.getByText('Home theme')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.querySelector('.home-theme-name')).toBeNull()
    expect(screen.getAllByLabelText(/Switch to .* theme/)).toHaveLength(16)
    expect(screen.getByLabelText('Switch to Enterprise theme')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders recent projects when provided', () => {
    renderHome({ mixJamFiles: RECENT_PROJECTS })

    expect(screen.getByText('club-night')).toBeTruthy()
    expect(screen.getByText('ambient-set')).toBeTruthy()
    const rail = document.querySelector('.home-recent')
    expect(rail).not.toBeNull()
    expect(rail?.closest('.home-setup')).toBeNull()
    expect(rail?.parentElement).toHaveClass('home-content')
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

  it('shows inline library progress without a blocking overlay', () => {
    const onCancelLibrarySync = vi.fn()
    const { container } = renderHome({
      librarySyncState: {
        status: 'syncing',
        rootKey: 'test-user-folder',
        jobId: 'job-1',
        hasUsableIndex: false,
        phase: 1,
        found: 4,
        processed: 0,
        total: 0
      },
      onCancelLibrarySync
    })

    const status = screen.getByText('Finding samples')
    expect(status).toBeInTheDocument()
    expect(status.closest('.folder-card')).toHaveTextContent('Sample Folder')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(container.querySelector('.scan-overlay')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancelLibrarySync).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeEnabled()
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
