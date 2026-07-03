import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { ElectronAPI, SessionPaths } from '../../../shared/ipc'

const PICK_ERROR = 'Cannot access this folder. Check permissions and try again.'
const RESTORE_ERROR = 'Folder not accessible — pick a new one.'
const LAUNCH_HINT = 'Select both folders above to start.'

const api = (): ElectronAPI => window.electronAPI

function card(label: string): HTMLElement {
  const heading = screen.getByText(label)
  const root = heading.closest('.folder-card')
  if (!root) throw new Error(`No folder card found for "${label}"`)
  return root as HTMLElement
}

function pickButton(label: string): HTMLElement {
  return within(card(label)).getByRole('button', { name: 'Pick Folder' })
}

async function renderFirstLaunch() {
  vi.mocked(api().loadSession).mockResolvedValue({ userFolder: null, sampleFolder: null })
  render(<App />)
  await waitFor(() => expect(api().loadSession).toHaveBeenCalled())
}

async function renderRestored(session: SessionPaths) {
  vi.mocked(api().loadSession).mockResolvedValue(session)
  render(<App />)
  await waitFor(() => expect(api().loadSession).toHaveBeenCalled())
}

describe('Spec 003 - Folder & Session Management acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api().loadSession).mockResolvedValue({ userFolder: null, sampleFolder: null })
    vi.mocked(api().validateFolder).mockResolvedValue(true)
    vi.mocked(api().pickFolder).mockResolvedValue(null)
    vi.mocked(api().saveSession).mockResolvedValue(undefined)
  })

  it('AC-001: Home shows a User Folder card above a Sample Folder card', async () => {
    await renderFirstLaunch()

    const userCard = card('User Folder')
    const sampleCard = card('Sample Folder')
    expect(userCard).toBeInTheDocument()
    expect(sampleCard).toBeInTheDocument()
    expect(userCard.compareDocumentPosition(sampleCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-002: User Folder pick button is always enabled', async () => {
    await renderFirstLaunch()
    expect(pickButton('User Folder')).toBeEnabled()
  })

  it('AC-003: Sample Folder card is initially disabled', async () => {
    await renderFirstLaunch()
    expect(card('Sample Folder')).toHaveAttribute('aria-disabled', 'true')
    expect(pickButton('Sample Folder')).toBeDisabled()
  })

  it('AC-004: Sample Folder card activates only after a User Folder is selected', async () => {
    await renderFirstLaunch()
    expect(pickButton('Sample Folder')).toBeDisabled()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())
    expect(card('Sample Folder')).toHaveAttribute('aria-disabled', 'false')
  })

  it('AC-005 / AC-006: Start is disabled with a hint until both folders are set', async () => {
    await renderFirstLaunch()

    const start = screen.getByRole('button', { name: 'Start New MixJam' })
    expect(start).toBeDisabled()
    expect(screen.getByText(LAUNCH_HINT)).toBeInTheDocument()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    // Only the user folder is set; still gated.
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeDisabled()
    expect(screen.getByText(LAUNCH_HINT)).toBeInTheDocument()
  })

  it('AC-007: with both folders set Start enables and navigates to the Player', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Samples')
    fireEvent.click(pickButton('Sample Folder'))

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    expect(screen.queryByText(LAUNCH_HINT)).not.toBeInTheDocument()

    fireEvent.click(start)
    await waitFor(() => expect(screen.getByText('Lane 1')).toBeInTheDocument())
    expect(vi.mocked(api().resizeToTracker)).toHaveBeenCalledTimes(1)
  })

  it('AC-008: Load MixJam is independent of folder state (disabled until spec-011)', async () => {
    // With no folders selected the launch gate blocks Start, but Load MixJam is
    // not part of the gate — its disabled state comes from spec-011 not having
    // shipped, signalled by the coming-soon tooltip rather than the gate hint.
    await renderFirstLaunch()

    const loadButton = screen.getByRole('button', { name: 'Load MixJam' })
    expect(loadButton).toBeDisabled()
    expect(loadButton).toHaveAttribute('title', expect.stringMatching(/coming soon/i))

    // Selecting folders opens the launch gate but does not change Load MixJam.
    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())
    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Samples')
    fireEvent.click(pickButton('Sample Folder'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeEnabled()
    )

    expect(screen.getByRole('button', { name: 'Load MixJam' })).toBeDisabled()
  })

  it('AC-009: each Pick Folder invokes the native picker with the matching role', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(api().pickFolder).toHaveBeenCalledWith('user'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Samples')
    fireEvent.click(pickButton('Sample Folder'))
    await waitFor(() => expect(api().pickFolder).toHaveBeenCalledWith('sample'))
  })

  it('AC-010: a validated folder path is shown on its card', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => {
      expect(within(card('User Folder')).getByText('C:/Users/me/MixJam')).toBeInTheDocument()
    })
  })

  it('AC-010a: a folder that fails validation shows the permission error', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/locked')
    vi.mocked(api().validateFolder).mockResolvedValueOnce(false)
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(PICK_ERROR)).toBeInTheDocument()
    })
    expect(pickButton('Sample Folder')).toBeDisabled()
  })

  it('AC-011 / AC-012: a fully restored session shows paths and opens the gate', async () => {
    vi.mocked(api().validateFolder).mockResolvedValue(true)
    await renderRestored({ userFolder: 'C:/Users/me/MixJam', sampleFolder: 'C:/Samples' })

    await waitFor(() => {
      expect(within(card('User Folder')).getByText('C:/Users/me/MixJam')).toBeInTheDocument()
    })
    expect(within(card('Sample Folder')).getByText('C:/Samples')).toBeInTheDocument()

    const start = screen.getByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    expect(api().validateFolder).toHaveBeenCalledWith('C:/Users/me/MixJam', 'user')
    expect(api().validateFolder).toHaveBeenCalledWith('C:/Samples', 'sample')
  })

  it('AC-013: a restored folder that is no longer accessible shows the restore error', async () => {
    vi.mocked(api().validateFolder).mockImplementation(async (_path, role) => role !== 'user')
    await renderRestored({ userFolder: 'C:/gone', sampleFolder: 'C:/Samples' })

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(RESTORE_ERROR)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeDisabled()
  })

  it('AC-014: selecting both folders persists the session via saveSession', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Samples')
    fireEvent.click(pickButton('Sample Folder'))

    await waitFor(() => {
      expect(vi.mocked(api().saveSession)).toHaveBeenCalledWith({
        userFolder: 'C:/Users/me/MixJam',
        sampleFolder: 'C:/Samples'
      })
    })
  })

  it('AC-015: changing the User Folder does not clear an existing Sample Folder', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Users/me/MixJam')
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce('C:/Samples')
    fireEvent.click(pickButton('Sample Folder'))
    await waitFor(() => {
      expect(within(card('Sample Folder')).getByText('C:/Samples')).toBeInTheDocument()
    })

    vi.mocked(api().pickFolder).mockResolvedValueOnce('D:/Users/me/MixJam2')
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => {
      expect(within(card('User Folder')).getByText('D:/Users/me/MixJam2')).toBeInTheDocument()
    })
    expect(within(card('Sample Folder')).getByText('C:/Samples')).toBeInTheDocument()
    expect(vi.mocked(api().saveSession)).toHaveBeenLastCalledWith({
      userFolder: 'D:/Users/me/MixJam2',
      sampleFolder: 'C:/Samples'
    })
  })
})
