import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ManagePanel from './ManagePanel'
import type { CategoryItem, LibraryItem, TagItem } from '../../../shared/backend-api'

const TAGS: TagItem[] = [
  { id: 1, name: 'Alpha', color: '#aaa' },
  { id: 2, name: 'Beta', color: null }
]

const CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Bass', parentId: null },
  { id: 2, name: 'Drums', parentId: null },
  { id: 3, name: 'Unsorted', parentId: null }
]

const LIBRARIES: LibraryItem[] = [
  { id: 1, name: 'MyLib', createdAt: 100, ruleJson: '{}' }
]

function renderPanel(overrides?: Partial<Parameters<typeof ManagePanel>[0]>) {
  const props: Parameters<typeof ManagePanel>[0] = {
    tags: TAGS,
    libraries: LIBRARIES,
    categories: CATEGORIES,
    onCreateTag: vi.fn(async () => ({ id: 99, name: 'New', color: null })),
    onRenameTag: vi.fn(async () => undefined),
    onDeleteTag: vi.fn(async () => undefined),
    onCreateCategory: vi.fn(async () => ({ id: 50, name: 'NewCat', parentId: null })),
    onDeleteCategory: vi.fn(async () => undefined),
    onSaveLibrary: vi.fn(async () => ({ id: 2, name: 'NewLib', createdAt: 200, ruleJson: '{}' })),
    onDeleteLibrary: vi.fn(async () => undefined),
    onApplyLibrary: vi.fn(),
    ...overrides
  }
  return { ...props, ...render(<ManagePanel {...props} />) }
}

describe('ManagePanel', () => {
  describe('tags tab', () => {
    it('renders the tags list', () => {
      renderPanel()
      expect(screen.getByText('Alpha')).toBeTruthy()
      expect(screen.getByText('Beta')).toBeTruthy()
    })

    it('creates a tag on Enter and clears the input', async () => {
      const onCreateTag = vi.fn(async () => ({ id: 99, name: 'Funky', color: null }))
      const { container } = renderPanel({ onCreateTag })
      const input = container.querySelector('input[aria-label="New tag name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Funky' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await vi.waitFor(() => expect(onCreateTag).toHaveBeenCalledWith('Funky'))
    })

    it('does not create a tag with an empty name', async () => {
      const onCreateTag = vi.fn(async () => ({ id: 99, name: '', color: null }))
      renderPanel({ onCreateTag })
      const btn = screen.getByLabelText('Create tag')
      fireEvent.click(btn)
      expect(onCreateTag).not.toHaveBeenCalled()
    })

    it('ignores non-Enter key presses on the tag input', () => {
      const onCreateTag = vi.fn(async () => ({ id: 99, name: 'X', color: null }))
      const { container } = renderPanel({ onCreateTag })
      const input = container.querySelector('input[aria-label="New tag name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.keyDown(input, { key: 'a' })
      expect(onCreateTag).not.toHaveBeenCalled()
    })

    it('returns early when Enter is pressed on an empty tag input', () => {
      const onCreateTag = vi.fn(async () => ({ id: 99, name: 'X', color: null }))
      const { container } = renderPanel({ onCreateTag })
      const input = container.querySelector('input[aria-label="New tag name"]')! as HTMLInputElement
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onCreateTag).not.toHaveBeenCalled()
    })

    it('enters rename mode and commits on Enter', async () => {
      const onRenameTag = vi.fn(async () => undefined)
      renderPanel({ onRenameTag })
      const renameBtn = screen.getByLabelText('Rename tag Alpha')
      fireEvent.click(renameBtn)

      const input = screen.getByLabelText('Rename tag Alpha') as HTMLInputElement
      expect(input.value).toBe('Alpha')
      fireEvent.change(input, { target: { value: 'AlphaRenamed' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await vi.waitFor(() => expect(onRenameTag).toHaveBeenCalledWith(1, 'AlphaRenamed'))
    })

    it('cancels rename on Escape', () => {
      renderPanel()
      fireEvent.click(screen.getByLabelText('Rename tag Alpha'))
      const input = screen.getByLabelText('Rename tag Alpha') as HTMLInputElement
      fireEvent.keyDown(input, { key: 'Escape' })
      // After Escape, the rename input should be gone and the tag name visible
      expect(screen.getByText('Alpha')).toBeTruthy()
    })

    it('does not commit rename when the value is empty', async () => {
      const onRenameTag = vi.fn(async () => undefined)
      renderPanel({ onRenameTag })
      fireEvent.click(screen.getByLabelText('Rename tag Beta'))
      const input = screen.getByLabelText('Rename tag Beta') as HTMLInputElement
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      // Should not call rename with whitespace-only
      expect(onRenameTag).not.toHaveBeenCalled()
    })

    it('deletes a tag on click', async () => {
      const onDeleteTag = vi.fn(async () => undefined)
      renderPanel({ onDeleteTag })
      fireEvent.click(screen.getByLabelText('Delete tag Alpha'))
      await vi.waitFor(() => expect(onDeleteTag).toHaveBeenCalledWith(1))
    })
  })

  describe('libraries tab', () => {
    it('renders the libraries list', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Libraries'))
      expect(screen.getByText('MyLib')).toBeTruthy()
    })

    it('shows empty message when no libraries exist', () => {
      renderPanel({ libraries: [] })
      fireEvent.click(screen.getByText('Libraries'))
      expect(screen.getByText('No saved libraries yet.')).toBeTruthy()
    })

    it('saves a library on Enter', async () => {
      const onSaveLibrary = vi.fn(async () => ({ id: 2, name: 'NewLib', createdAt: 200, ruleJson: '{}' }))
      const { container } = renderPanel({ onSaveLibrary })
      fireEvent.click(screen.getByText('Libraries'))
      const input = container.querySelector('input[aria-label="New library name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'NewLib' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await vi.waitFor(() => expect(onSaveLibrary).toHaveBeenCalledWith('NewLib'))
    })

    it('does not save a library with an empty name', async () => {
      const onSaveLibrary = vi.fn(async () => ({ id: 2, name: '', createdAt: 200, ruleJson: '{}' }))
      renderPanel({ onSaveLibrary })
      fireEvent.click(screen.getByText('Libraries'))
      // Button should be disabled
      const btn = screen.getByText('Save current filters')
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })

    it('ignores non-Enter key presses on the library input', () => {
      const onSaveLibrary = vi.fn(async () => ({ id: 2, name: 'X', createdAt: 200, ruleJson: '{}' }))
      const { container } = renderPanel({ onSaveLibrary })
      fireEvent.click(screen.getByText('Libraries'))
      const input = container.querySelector('input[aria-label="New library name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.keyDown(input, { key: 'a' })
      expect(onSaveLibrary).not.toHaveBeenCalled()
    })

    it('returns early when Enter is pressed on an empty library input', () => {
      const onSaveLibrary = vi.fn(async () => ({ id: 2, name: 'X', createdAt: 200, ruleJson: '{}' }))
      const { container } = renderPanel({ onSaveLibrary })
      fireEvent.click(screen.getByText('Libraries'))
      const input = container.querySelector('input[aria-label="New library name"]')! as HTMLInputElement
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSaveLibrary).not.toHaveBeenCalled()
    })

    it('deletes a library on click', async () => {
      const onDeleteLibrary = vi.fn(async () => undefined)
      renderPanel({ onDeleteLibrary })
      fireEvent.click(screen.getByText('Libraries'))
      fireEvent.click(screen.getByLabelText('Delete library MyLib'))
      await vi.waitFor(() => expect(onDeleteLibrary).toHaveBeenCalledWith(1))
    })
  })

  describe('categories tab', () => {
    it('renders non-root-hardcoded categories', () => {
      const { container } = renderPanel()
      fireEvent.click(screen.getByText('Categories'))
      // Bass and Drums are shown; Unsorted is hidden (isRootHardcoded)
      const listItems = container.querySelectorAll('.manage-list-item .manage-name')
      const names = Array.from(listItems).map((el) => el.textContent)
      expect(names).toContain('Bass')
      expect(names).toContain('Drums')
      expect(names).not.toContain('Unsorted')
    })

    it('creates a category with a parent', async () => {
      const onCreateCategory = vi.fn(async () => ({ id: 50, name: 'SubBass', parentId: 1 }))
      const { container } = renderPanel({ onCreateCategory })
      fireEvent.click(screen.getByText('Categories'))
      const input = container.querySelector('input[aria-label="New category name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'SubBass' } })
      const select = container.querySelector('select[aria-label="Parent category"]')! as HTMLSelectElement
      fireEvent.change(select, { target: { value: '1' } })
      fireEvent.click(screen.getByLabelText('Add category'))

      await vi.waitFor(() => expect(onCreateCategory).toHaveBeenCalledWith('SubBass', 1))
    })

    it('does not create a category with an empty name', async () => {
      const onCreateCategory = vi.fn(async () => ({ id: 50, name: '', parentId: null }))
      renderPanel({ onCreateCategory })
      fireEvent.click(screen.getByText('Categories'))
      const btn = screen.getByLabelText('Add category')
      fireEvent.click(btn)
      expect(onCreateCategory).not.toHaveBeenCalled()
    })

    it('deletes a category on click', async () => {
      const onDeleteCategory = vi.fn(async () => undefined)
      renderPanel({ onDeleteCategory })
      fireEvent.click(screen.getByText('Categories'))
      fireEvent.click(screen.getByLabelText('Delete category Bass'))
      await vi.waitFor(() => expect(onDeleteCategory).toHaveBeenCalledWith(1))
    })

    it('creates a category on Enter key', async () => {
      const onCreateCategory = vi.fn(async () => ({ id: 51, name: 'Kick', parentId: null }))
      const { container } = renderPanel({ onCreateCategory })
      fireEvent.click(screen.getByText('Categories'))
      const input = container.querySelector('input[aria-label="New category name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Kick' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await vi.waitFor(() => expect(onCreateCategory).toHaveBeenCalledWith('Kick', undefined))
    })

    it('ignores non-Enter key presses on the category input', () => {
      const onCreateCategory = vi.fn(async () => ({ id: 51, name: 'X', parentId: null }))
      const { container } = renderPanel({ onCreateCategory })
      fireEvent.click(screen.getByText('Categories'))
      const input = container.querySelector('input[aria-label="New category name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.keyDown(input, { key: 'a' })
      expect(onCreateCategory).not.toHaveBeenCalled()
    })

    it('returns early when Enter is pressed on an empty category input', () => {
      const onCreateCategory = vi.fn(async () => ({ id: 51, name: 'X', parentId: null }))
      const { container } = renderPanel({ onCreateCategory })
      fireEvent.click(screen.getByText('Categories'))
      const input = container.querySelector('input[aria-label="New category name"]')! as HTMLInputElement
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onCreateCategory).not.toHaveBeenCalled()
    })

    it('resets parent category to undefined when select is changed back to Root', () => {
      const onCreateCategory = vi.fn(async () => ({ id: 51, name: 'X', parentId: null }))
      const { container } = renderPanel({ onCreateCategory })
      fireEvent.click(screen.getByText('Categories'))
      const select = container.querySelector('select[aria-label="Parent category"]')! as HTMLSelectElement
      // Select a parent first
      fireEvent.change(select, { target: { value: '1' } })
      // Then change back to Root (empty string)
      fireEvent.change(select, { target: { value: '' } })
      const input = container.querySelector('input[aria-label="New category name"]')! as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(screen.getByLabelText('Add category'))
      // parentId should be undefined, not 1
      expect(onCreateCategory).toHaveBeenCalledWith('Test', undefined)
    })
  })
})
