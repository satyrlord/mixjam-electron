import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { BackendAPI, FolderRef, FolderSelections } from '../../../shared/backend-api'

const PICK_ERROR = 'Cannot access this folder. Check permissions and try again.'
const RESTORE_ERROR = 'Folder not accessible — pick a new one.'
const LAUNCH_HINT = 'Select both folders above to start.'

const USER_REF: FolderRef = { id: 'user-1', name: 'MixJam' }
const SAMPLE_REF: FolderRef = { id: 'sample-1', name: 'Samples' }

const api = (): BackendAPI => window.backendAPI

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
  vi.mocked(api().loadFolderSelections).mockResolvedValue({ userFolder: null, sampleFolder: null })
  render(<App />)
  await waitFor(() => expect(api().loadFolderSelections).toHaveBeenCalled())
}

async function renderRestored(selections: FolderSelections) {
  vi.mocked(api().loadFolderSelections).mockResolvedValue(selections)
  render(<App />)
  await waitFor(() => expect(api().loadFolderSelections).toHaveBeenCalled())
}

describe('Spec 003 - Folder & App State Management acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api().loadFolderSelections).mockResolvedValue({ userFolder: null, sampleFolder: null })
    vi.mocked(api().validateFolder).mockResolvedValue('ok')
    vi.mocked(api().pickFolder).mockResolvedValue(null)
    vi.mocked(api().saveFolderSelections).mockResolvedValue(undefined)
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

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())
    expect(card('Sample Folder')).toHaveAttribute('aria-disabled', 'false')
  })

  it('AC-005 / AC-006: Start is disabled with a hint until both folders are set', async () => {
    await renderFirstLaunch()

    const start = screen.getByRole('button', { name: 'Start New MixJam' })
    expect(start).toBeDisabled()
    expect(screen.getByText(LAUNCH_HINT)).toBeInTheDocument()

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    // Only the user folder is set; still gated.
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeDisabled()
    expect(screen.getByText(LAUNCH_HINT)).toBeInTheDocument()
  })

  it('AC-007: with both folders set Start enables and navigates to the Player', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce(SAMPLE_REF)
    fireEvent.click(pickButton('Sample Folder'))

    const start = await screen.findByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    expect(screen.queryByText(LAUNCH_HINT)).not.toBeInTheDocument()

    fireEvent.click(start)
    await waitFor(() => expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0))
    expect(vi.mocked(api().resizeToPlayer)).toHaveBeenCalledTimes(1)
  })

  it('AC-008: Load MixJam becomes available when both project folders are ready', async () => {
    // Projects use User Folder-relative project paths and Sample Folder-relative
    // sample references, so the same folder gate applies to starting and loading.
    await renderFirstLaunch()

    const loadButton = screen.getByRole('button', { name: 'Load MixJam' })
    expect(loadButton).toBeDisabled()
    expect(loadButton).not.toHaveAttribute('title')

    // Selecting both folders opens the launch gate for both actions.
    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())
    vi.mocked(api().pickFolder).mockResolvedValueOnce(SAMPLE_REF)
    fireEvent.click(pickButton('Sample Folder'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeEnabled()
    )

    expect(screen.getByRole('button', { name: 'Load MixJam' })).toBeEnabled()
  })

  it('AC-009: each Pick Folder invokes the directory picker with the matching role', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(api().pickFolder).toHaveBeenCalledWith('user'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce(SAMPLE_REF)
    fireEvent.click(pickButton('Sample Folder'))
    await waitFor(() => expect(api().pickFolder).toHaveBeenCalledWith('sample'))
  })

  it('AC-010: a validated folder name is shown on its card', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(USER_REF.name)).toBeInTheDocument()
    })
  })

  it('AC-010a: a folder that fails validation shows the permission error', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce({ id: 'locked-1', name: 'locked' })
    vi.mocked(api().validateFolder).mockResolvedValueOnce('invalid')
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(PICK_ERROR)).toBeInTheDocument()
    })
    expect(pickButton('Sample Folder')).toBeDisabled()
  })

  it('AC-011 / AC-012: fully restored folder selections show folder names and open the gate', async () => {
    vi.mocked(api().validateFolder).mockResolvedValue('ok')
    await renderRestored({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(USER_REF.name)).toBeInTheDocument()
    })
    expect(within(card('Sample Folder')).getByText(SAMPLE_REF.name)).toBeInTheDocument()

    const start = screen.getByRole('button', { name: 'Start New MixJam' })
    await waitFor(() => expect(start).toBeEnabled())
    expect(api().validateFolder).toHaveBeenCalledWith(USER_REF, 'user')
    expect(api().validateFolder).toHaveBeenCalledWith(SAMPLE_REF, 'sample')
  })

  it('AC-013: a restored folder that is no longer accessible shows the restore error', async () => {
    vi.mocked(api().validateFolder).mockImplementation(async (_ref: FolderRef, role) =>
      role === 'user' ? 'invalid' : 'ok'
    )
    await renderRestored({ userFolder: { id: 'gone-1', name: 'gone' }, sampleFolder: SAMPLE_REF })

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(RESTORE_ERROR)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeDisabled()
  })

  it('AC-013a: a restored handle needing a permission re-grant offers Restore access', async () => {
    vi.mocked(api().validateFolder).mockImplementation(async (_ref: FolderRef, role) =>
      role === 'sample' ? 'needs-permission' : 'ok'
    )
    await renderRestored({ userFolder: USER_REF, sampleFolder: SAMPLE_REF })

    const restore = await within(card('Sample Folder')).findByRole('button', {
      name: `Restore access to ${SAMPLE_REF.name}`
    })
    expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeDisabled()

    // Granting access flips the card to set and opens the gate.
    vi.mocked(api().requestFolderAccess).mockResolvedValueOnce(true)
    vi.mocked(api().validateFolder).mockResolvedValue('ok')
    fireEvent.click(restore)

    await waitFor(() => {
      expect(within(card('Sample Folder')).getByText(SAMPLE_REF.name)).toBeInTheDocument()
    })
    expect(api().requestFolderAccess).toHaveBeenCalledWith(SAMPLE_REF, 'sample')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start New MixJam' })).toBeEnabled()
    )
  })

  it('AC-014: selecting both folders persists them via saveFolderSelections', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce(SAMPLE_REF)
    fireEvent.click(pickButton('Sample Folder'))

    await waitFor(() => {
      expect(vi.mocked(api().saveFolderSelections)).toHaveBeenCalledWith({
        userFolder: USER_REF,
        sampleFolder: SAMPLE_REF
      })
    })
  })

  it('AC-015: changing the User Folder does not clear an existing Sample Folder', async () => {
    await renderFirstLaunch()

    vi.mocked(api().pickFolder).mockResolvedValueOnce(USER_REF)
    fireEvent.click(pickButton('User Folder'))
    await waitFor(() => expect(pickButton('Sample Folder')).toBeEnabled())

    vi.mocked(api().pickFolder).mockResolvedValueOnce(SAMPLE_REF)
    fireEvent.click(pickButton('Sample Folder'))
    await waitFor(() => {
      expect(within(card('Sample Folder')).getByText(SAMPLE_REF.name)).toBeInTheDocument()
    })

    const newUserRef: FolderRef = { id: 'user-2', name: 'MixJam2' }
    vi.mocked(api().pickFolder).mockResolvedValueOnce(newUserRef)
    fireEvent.click(pickButton('User Folder'))

    await waitFor(() => {
      expect(within(card('User Folder')).getByText(newUserRef.name)).toBeInTheDocument()
    })
    expect(within(card('Sample Folder')).getByText(SAMPLE_REF.name)).toBeInTheDocument()
    expect(vi.mocked(api().saveFolderSelections)).toHaveBeenLastCalledWith({
      userFolder: newUserRef,
      sampleFolder: SAMPLE_REF
    })
  })
})
