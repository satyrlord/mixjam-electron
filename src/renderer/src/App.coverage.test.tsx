import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  folder: {
    userFolder: { status: 'unset' },
    sampleFolder: { status: 'unset' },
    canStart: true,
    pickUser: vi.fn(), pickSample: vi.fn(), restoreUser: vi.fn(), restoreSample: vi.fn()
  } as Record<string, unknown>,
  app: {} as Record<string, unknown>,
  generator: {} as Record<string, unknown>
}))

vi.mock('./hooks/useFolderSetup', () => ({ useFolderSetup: () => mocks.folder }))
vi.mock('./hooks/useAppState', () => ({ useAppState: () => mocks.app }))
vi.mock('./hooks/useMixJamGenerator', () => ({ useMixJamGenerator: () => mocks.generator }))
vi.mock('./hooks/playerViewModel', () => ({
  createPlayerViewModel: () => ({ browser: {}, arrangement: {}, transport: {}, mixer: {}, project: {} })
}))
vi.mock('./theme/themes', () => ({ selectTheme: (key: string) => key === 'bad' ? 'emerald' : key }))
vi.mock('./components/ui/Tooltip', () => ({ TooltipProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./components/Header', () => ({ default: (props: { onHome: () => void; onThemeChange: (key: string) => void; theme: string }) => (
  <div><span>{props.theme}</span><button onClick={props.onHome}>Home mock</button><button onClick={() => props.onThemeChange('enterprise')}>Theme mock</button></div>
) }))
vi.mock('./components/HomeScreen', () => ({ default: (props: {
  onRetryLibrarySync: () => void; onCancelLibrarySync: () => void; onOpenGenerator: () => void
}) => <div>Home screen mock<button onClick={props.onRetryLibrarySync}>Retry mock</button><button onClick={props.onCancelLibrarySync}>Cancel mock</button><button onClick={props.onOpenGenerator}>Generator mock</button></div> }))
vi.mock('./components/PlayerView', () => ({ default: () => <div>Player view mock</div> }))
vi.mock('./components/Footer', () => ({ default: () => <div>Footer mock</div> }))
vi.mock('./components/MixJamGeneratorDialog', () => ({ default: () => <div>Generator dialog mock</div> }))

import App from './App'

function resetState() {
  Object.assign(mocks.folder, {
    userFolder: { status: 'unset' }, sampleFolder: { status: 'unset' }, canStart: true,
    pickUser: vi.fn(), pickSample: vi.fn(), restoreUser: vi.fn(), restoreSample: vi.fn()
  })
  Object.assign(mocks.app, {
    view: 'home', timerText: '00:00', projectError: null, projectWarning: 'Heads up',
    clearProjectNotice: vi.fn(), goToHome: vi.fn(), retryLibrarySync: vi.fn().mockResolvedValue(undefined),
    cancelLibrarySync: vi.fn().mockResolvedValue(undefined), librarySyncState: { status: 'unavailable' },
    mixJamFiles: [], projectBusy: false, startNewProject: vi.fn(), openProjectPicker: vi.fn(),
    openProjectPath: vi.fn(), version: 'test', selectedSampleDetail: null, openRepo: vi.fn(),
    getSampleBuffer: vi.fn()
  })
  Object.assign(mocks.generator, {
    open: false, readiness: null, initialParameters: undefined, generating: false, saving: false,
    progress: null, result: null, error: null, close: vi.fn(), onGenerate: vi.fn(),
    onOpenResult: vi.fn(), openNew: vi.fn(), openRegenerateExact: vi.fn(), openRegenerateCurrent: vi.fn()
  })
}

describe('App wiring coverage', () => {
  beforeEach(resetState)

  it('wires Home callbacks, notices, and theme changes', () => {
    render(<App />)
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Dismiss project message'))
    fireEvent.click(screen.getByText('Retry mock'))
    fireEvent.click(screen.getByText('Cancel mock'))
    fireEvent.click(screen.getByText('Generator mock'))
    fireEvent.click(screen.getByText('Theme mock'))
    fireEvent.click(screen.getByText('Home mock'))
    expect(mocks.app.clearProjectNotice).toHaveBeenCalled()
    expect(mocks.app.retryLibrarySync).toHaveBeenCalled()
    expect(mocks.app.cancelLibrarySync).toHaveBeenCalled()
    expect(mocks.generator.openNew).toHaveBeenCalled()
    expect(screen.getByText('enterprise')).toBeInTheDocument()
    expect(mocks.app.goToHome).toHaveBeenCalled()
  })

  it('resolves set folders and renders the Player error branch', () => {
    mocks.folder.userFolder = { status: 'set', ref: { id: 'u', name: 'User' } }
    mocks.folder.sampleFolder = { status: 'set', ref: { id: 's', name: 'Samples' } }
    mocks.app.view = 'player'
    mocks.app.projectWarning = null
    mocks.app.projectError = 'Load failed'
    render(<App />)
    expect(screen.getByText('Player view mock')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('project-notice-error')
    expect(screen.getByText('Load failed')).toBeInTheDocument()
  })

  it('renders without a project notice', () => {
    mocks.app.projectWarning = null
    render(<App />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
