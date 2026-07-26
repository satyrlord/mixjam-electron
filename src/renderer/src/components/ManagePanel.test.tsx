import { fireEvent, render, screen } from '../test/render'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryItem, TagItem } from '../../../shared/backend-api'
import ManagePanel from './ManagePanel'

const TAGS: TagItem[] = [
  { id: 1, name: 'Alpha', color: '#aaaaaa', origin: 'user', folderDerived: false },
  { id: 2, name: 'Bass', color: null, origin: 'folder', folderDerived: true },
  { id: 3, name: 'Drums', color: null, origin: 'shared', folderDerived: true }
]
const LIBRARIES: LibraryItem[] = [{ id: 1, name: 'MyLib', createdAt: 100, ruleJson: '{}' }]

function renderPanel(overrides: Partial<Parameters<typeof ManagePanel>[0]> = {}) {
  const props: Parameters<typeof ManagePanel>[0] = {
    tags: TAGS,
    libraries: LIBRARIES,
    onCreateTag: vi.fn(async (name, color) => ({ id: 99, name, color: color ?? null, origin: 'user' as const, folderDerived: false })),
    onRenameTag: vi.fn(async () => undefined),
    onSetTagColor: vi.fn(async () => undefined),
    onDeleteTag: vi.fn(async () => undefined),
    onSaveLibrary: vi.fn(async (name) => ({ id: 2, name, createdAt: 200, ruleJson: '{}' })),
    onDeleteLibrary: vi.fn(async () => undefined),
    onApplyLibrary: vi.fn(),
    ...overrides
  }
  return { props, ...render(<ManagePanel {...props} />) }
}

describe('ManagePanel', () => {
  it('contains only Tags and Libraries tabs', () => {
    renderPanel()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Tags', 'Libraries'])
  })

  it('searches a large tag catalog without changing the source list', () => {
    renderPanel()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search managed tags' }), { target: { value: 'bass' } })
    expect(screen.getByText('Bass')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('creates a tag with and without an optional color', async () => {
    const onCreateTag = vi.fn(async (name: string, color?: string) => ({ id: 99, name, color: color ?? null, origin: 'user' as const, folderDerived: false }))
    renderPanel({ onCreateTag })
    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Funky' } })
    fireEvent.keyDown(screen.getByLabelText('New tag name'), { key: 'Enter' })
    await vi.waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Funky', undefined))

    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Warm' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Color' }))
    fireEvent.change(screen.getByLabelText('New tag color'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByLabelText('Create tag'))
    await vi.waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Warm', '#123456'))
  })

  it('renames, recolors, and deletes a user tag', async () => {
    const onRenameTag = vi.fn(async () => undefined)
    const onSetTagColor = vi.fn(async () => undefined)
    const onDeleteTag = vi.fn(async () => undefined)
    renderPanel({ onRenameTag, onSetTagColor, onDeleteTag })

    fireEvent.click(screen.getByLabelText('Rename tag Alpha'))
    fireEvent.change(screen.getByLabelText('Rename tag Alpha'), { target: { value: 'Alpha 2' } })
    fireEvent.keyDown(screen.getByLabelText('Rename tag Alpha'), { key: 'Enter' })
    await vi.waitFor(() => expect(onRenameTag).toHaveBeenCalledWith(1, 'Alpha 2'))

    fireEvent.change(screen.getByLabelText('Set color for tag Alpha'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByLabelText('Delete tag Alpha'))
    await vi.waitFor(() => expect(onSetTagColor).toHaveBeenCalledWith(1, '#123456'))
    expect(onDeleteTag).toHaveBeenCalledWith(1)
  })

  it('shows folder-only tags as read-only and dual-source tags as editable', () => {
    renderPanel()
    expect(screen.getByText('From folder')).toBeInTheDocument()
    expect(screen.getByLabelText('Set color for tag Bass')).toBeDisabled()
    expect(screen.queryByLabelText('Rename tag Bass')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Delete tag Bass')).not.toBeInTheDocument()
    expect(screen.getByText('Also from folder')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rename tag Drums')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Delete tag Drums')).toBeEnabled()
  })

  it('opens, saves, and deletes libraries', async () => {
    const onSaveLibrary = vi.fn(async (name: string) => ({ id: 2, name, createdAt: 200, ruleJson: '{}' }))
    const onDeleteLibrary = vi.fn(async () => undefined)
    const onApplyLibrary = vi.fn()
    renderPanel({ onSaveLibrary, onDeleteLibrary, onApplyLibrary })
    fireEvent.click(screen.getByRole('tab', { name: 'Libraries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open library MyLib' }))
    expect(onApplyLibrary).toHaveBeenCalledWith(LIBRARIES[0])
    fireEvent.change(screen.getByLabelText('New library name'), { target: { value: 'NewLib' } })
    fireEvent.keyDown(screen.getByLabelText('New library name'), { key: 'Enter' })
    fireEvent.click(screen.getByLabelText('Delete library MyLib'))
    await vi.waitFor(() => expect(onSaveLibrary).toHaveBeenCalledWith('NewLib'))
    expect(onDeleteLibrary).toHaveBeenCalledWith(1)
  })
})
