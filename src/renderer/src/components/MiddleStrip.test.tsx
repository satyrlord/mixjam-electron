import { fireEvent, render, screen, within } from '../test/render'
import { describe, expect, it, vi } from 'vitest'
import type { LibrarySyncState } from '../../../shared/backend-api'
import MiddleStrip, { type MiddleStripTransportProps } from './MiddleStrip'

const READY: LibrarySyncState = {
  status: 'ready',
  rootKey: 'samples',
  lastCompletedAt: 1
}

/**
 * Flat overrides, assembled into the component's grouped props. Tests name one
 * value ("projectDirty") without restating the group it belongs to.
 */
interface MiddleStripOverrides {
  projectName?: string
  projectDirty?: boolean
  projectBusy?: boolean
  canRegenerate?: boolean
  onNewProject?: () => void
  onOpenProject?: () => void
  onSaveProject?: () => void
  onSaveProjectAs?: () => void
  onRegenerateExact?: (opener?: HTMLElement) => void
  onRegenerateCurrent?: (opener?: HTMLElement) => void
  transportState?: MiddleStripTransportProps['state']
  bpm?: number
  jumpToEndDisabled?: boolean
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onTransportPlay?: () => void
  onTransportPause?: () => void
  onTransportStop?: () => void
  onTransportSkipBack?: () => void
  onTransportJumpToEnd?: () => void
  onSetBpm?: (bpm: number) => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  librarySyncState?: LibrarySyncState
  onRescanLibrary?: () => void
  onCancelLibrarySync?: () => void
  onRetryLibrarySync?: () => void
  onOpenShortcuts?: () => void
}

function renderMiddleStrip(overrides: MiddleStripOverrides = {}) {
  const props: React.ComponentProps<typeof MiddleStrip> = {
    scrollport: { ref: { current: null }, id: 'tracker-scrollport' },
    project: {
      name: overrides.projectName ?? 'club-night',
      dirty: overrides.projectDirty ?? false,
      busy: overrides.projectBusy ?? false,
      canRegenerate: overrides.canRegenerate,
      onNew: overrides.onNewProject ?? vi.fn(),
      onOpen: overrides.onOpenProject ?? vi.fn(),
      onSave: overrides.onSaveProject ?? vi.fn(),
      onSaveAs: overrides.onSaveProjectAs ?? vi.fn(),
      onRegenerateExact: overrides.onRegenerateExact,
      onRegenerateCurrent: overrides.onRegenerateCurrent
    },
    transport: {
      state: overrides.transportState ?? 'stopped',
      bpm: overrides.bpm ?? 140,
      jumpToEndDisabled: overrides.jumpToEndDisabled ?? false,
      canUndo: overrides.canUndo ?? true,
      canRedo: overrides.canRedo ?? true,
      onUndo: overrides.onUndo ?? vi.fn(),
      onRedo: overrides.onRedo ?? vi.fn(),
      onPlay: overrides.onTransportPlay ?? vi.fn(),
      onPause: overrides.onTransportPause ?? vi.fn(),
      onStop: overrides.onTransportStop ?? vi.fn(),
      onSkipBack: overrides.onTransportSkipBack ?? vi.fn(),
      onJumpToEnd: overrides.onTransportJumpToEnd ?? vi.fn(),
      onSetBpm: overrides.onSetBpm ?? vi.fn()
    },
    library: {
      searchQuery: overrides.searchQuery ?? '',
      onSearchChange: overrides.onSearchChange ?? vi.fn(),
      syncState: overrides.librarySyncState ?? READY,
      onRescan: overrides.onRescanLibrary ?? vi.fn(),
      onCancelSync: overrides.onCancelLibrarySync ?? vi.fn(),
      onRetrySync: overrides.onRetryLibrarySync ?? vi.fn()
    },
    onOpenShortcuts: overrides.onOpenShortcuts ?? vi.fn()
  }

  return { ...render(<MiddleStrip {...props} />), props }
}

function openMenu(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' })
}

describe('MiddleStrip', () => {
  it('puts project file commands in one project menu', () => {
    const onNewProject = vi.fn()
    const onSaveProject = vi.fn()
    renderMiddleStrip({
      projectName: 'a very long project name',
      projectDirty: true,
      onNewProject,
      onSaveProject
    })

    const trigger = screen.getByRole('button', {
      name: 'a very long project name, unsaved changes, project menu'
    })
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'New' }))
    expect(onNewProject).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    expect(onSaveProject).toHaveBeenCalledTimes(1)
  })

  it('offers both regeneration paths only for generated projects', () => {
    const onRegenerateExact = vi.fn()
    const onRegenerateCurrent = vi.fn()
    const { unmount } = renderMiddleStrip()
    openMenu('club-night, project menu')
    expect(screen.queryByRole('menuitem', { name: 'Regenerate exact' })).not.toBeInTheDocument()
    unmount()

    renderMiddleStrip({ canRegenerate: true, onRegenerateExact, onRegenerateCurrent })
    openMenu('club-night, project menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Regenerate exact' }))
    expect(onRegenerateExact).toHaveBeenCalledOnce()
    openMenu('club-night, project menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Regenerate with current library' }))
    expect(onRegenerateCurrent).toHaveBeenCalledOnce()
  })

  it('keeps edit history separate from exactly four transport actions', () => {
    renderMiddleStrip()

    const transport = screen.getByLabelText('Transport Ribbon')
    expect(within(transport).getAllByRole('button')).toHaveLength(4)
    expect(within(transport).getByRole('button', { name: 'Skip Back' })).toBeInTheDocument()
    expect(within(transport).getByRole('button', { name: 'Jump to End' })).toBeInTheDocument()
    expect(within(transport).getByRole('button', { name: 'Play' })).toHaveClass('strip-command-primary')
    expect(within(transport).getByRole('button', { name: 'Stop' })).not.toHaveClass('strip-command-primary')
    expect(screen.getByRole('button', { name: 'Undo' })).not.toBe(transport.querySelector('button'))
    expect(transport.contains(screen.getByRole('button', { name: 'Undo' }))).toBe(false)
    expect(transport.contains(screen.getByRole('button', { name: 'Redo' }))).toBe(false)
  })

  it('keeps shortcuts and the single manual re-scan in the More menu', () => {
    const onOpenShortcuts = vi.fn()
    const onRescanLibrary = vi.fn()
    renderMiddleStrip({ onOpenShortcuts, onRescanLibrary })

    expect(screen.queryByText('Uniform Re-scan')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Re-scan Sample Folder' })).not.toBeInTheDocument()

    openMenu('More actions')
    const rescanItems = screen.getAllByRole('menuitem', { name: 'Re-scan Sample Folder' })
    expect(rescanItems).toHaveLength(1)
    expect(screen.getByText('Use if files changed while MixJam is already open.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keyboard Shortcuts' }))
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)

    openMenu('More actions')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Re-scan Sample Folder' }))
    expect(onRescanLibrary).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Uniform Re-scan')).not.toBeInTheDocument()
  })

  it('shows bounded active sync status with contextual Cancel', () => {
    const onCancelLibrarySync = vi.fn()
    renderMiddleStrip({
      librarySyncState: {
        status: 'syncing',
        rootKey: 'samples',
        jobId: 'job-1',
        hasUsableIndex: true,
        phase: 2,
        found: 100,
        processed: 50,
        total: 100
      },
      onCancelLibrarySync
    })

    expect(screen.getByRole('status', { name: 'Updating library, 50% complete' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel library sync' }))
    expect(onCancelLibrarySync).toHaveBeenCalledTimes(1)

    openMenu('More actions')
    expect(screen.getByRole('menuitem', { name: 'Re-scan Sample Folder' })).toHaveAttribute(
      'data-disabled'
    )
  })

  it('shows Retry only for a failed or cancelled sync', () => {
    const onRetryLibrarySync = vi.fn()
    renderMiddleStrip({
      librarySyncState: {
        status: 'error',
        rootKey: 'samples',
        message: 'The folder is unavailable',
        hasUsableIndex: false
      },
      onRetryLibrarySync
    })

    expect(screen.getByRole('status', {
      name: 'Library sync failed: The folder is unavailable'
    })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry library sync' }))
    expect(onRetryLibrarySync).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Cancel library sync' })).not.toBeInTheDocument()
  })

  it('does not offer Retry when an existing index remains usable', () => {
    renderMiddleStrip({
      librarySyncState: {
        status: 'error',
        rootKey: 'samples',
        message: 'A refresh failed',
        hasUsableIndex: true
      }
    })

    expect(screen.getByRole('status', {
      name: 'Library sync failed: A refresh failed'
    })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry library sync' })).not.toBeInTheDocument()
  })

  it('routes sample search without changing the command dock', () => {
    const onSearchChange = vi.fn()
    renderMiddleStrip({ onSearchChange })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search samples' }), {
      target: { value: 'bass' }
    })

    expect(onSearchChange).toHaveBeenCalledWith('bass')
  })

  it('renders a horizontal BPM control in the project zone', () => {
    renderMiddleStrip({ bpm: 128 })

    const strip = document.querySelector('.strip-project-zone')
    const slider = screen.getByRole('slider', { name: 'BPM' })
    const input = screen.getByRole('textbox', { name: 'BPM value' })

    expect(strip).toContainElement(slider)
    expect(strip).toContainElement(input)
    expect(slider).toHaveAttribute('aria-orientation', 'horizontal')
    expect(slider).toHaveAttribute('aria-valuenow', '128')
    expect(input).toHaveValue('128')
  })

})
