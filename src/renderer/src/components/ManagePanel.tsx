import { useState } from 'react'
import type { CategoryItem, LibraryItem, TagItem } from '../../../shared/backend-api'
import { ROOT_CATEGORY_NAMES } from '../lib/sample-utils'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from './ui/Tabs'
import { Tooltip } from './ui/Tooltip'

type ManageTab = 'tags' | 'libraries' | 'categories'

interface ManagePanelProps {
  tags: TagItem[]
  libraries: LibraryItem[]
  categories: CategoryItem[]
  /** Left offset in px — must track the resizable category-tree width so the
   *  panel's edge stays aligned with the splitter it overlays. */
  leftOffset: number
  onCreateTag: (name: string, color?: string) => Promise<TagItem>
  onRenameTag: (id: number, name: string) => Promise<void>
  onSetTagColor: (id: number, color: string | null) => Promise<void>
  onDeleteTag: (id: number) => Promise<void>
  onCreateCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  onDeleteCategory: (id: number) => Promise<void>
  onSaveLibrary: (name: string) => Promise<LibraryItem>
  onDeleteLibrary: (id: number) => Promise<void>
  onApplyLibrary: (library: LibraryItem) => void
}

interface CategoryTreeEntry {
  category: CategoryItem
  path: string
}

function flattenCategoryTree(categories: readonly CategoryItem[]): CategoryTreeEntry[] {
  const childrenByParent = new Map<number | null, CategoryItem[]>()
  for (const category of categories) {
    const siblings = childrenByParent.get(category.parentId) ?? []
    siblings.push(category)
    childrenByParent.set(category.parentId, siblings)
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name))
  }

  const entries: CategoryTreeEntry[] = []
  const appendChildren = (parentId: number | null, parentPath: string): void => {
    for (const category of childrenByParent.get(parentId) ?? []) {
      const path = parentPath ? `${parentPath} / ${category.name}` : category.name
      entries.push({ category, path })
      appendChildren(category.id, path)
    }
  }
  appendChildren(null, '')
  return entries
}

const isProtectedCategory = (category: CategoryItem) =>
  category.parentId === null && ROOT_CATEGORY_NAMES.includes(category.name)
const DEFAULT_TAG_COLOR = '#00674f'

function colorInputValue(color: string | null): string {
  if (!color) return DEFAULT_TAG_COLOR
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  return shortHex
    ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
    : DEFAULT_TAG_COLOR
}

export default function ManagePanel({
  tags,
  libraries,
  categories,
  leftOffset,
  onCreateTag,
  onRenameTag,
  onSetTagColor,
  onDeleteTag,
  onCreateCategory,
  onDeleteCategory,
  onSaveLibrary,
  onDeleteLibrary,
  onApplyLibrary
}: ManagePanelProps) {
  const [tab, setTab] = useState<ManageTab>('tags')

  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR)
  const [newTagHasColor, setNewTagHasColor] = useState(false)
  const [renamingTagId, setRenamingTagId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | undefined>(undefined)

  const [newLibraryName, setNewLibraryName] = useState('')

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    if (newTagHasColor) await onCreateTag(name, newTagColor)
    else await onCreateTag(name)
    setNewTagName('')
    setNewTagHasColor(false)
  }

  const handleCommitRename = async (id: number) => {
    const name = renameValue.trim()
    if (name) await onRenameTag(id, name)
    setRenamingTagId(null)
    setRenameValue('')
  }

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    await onCreateCategory(name, newCategoryParentId)
    setNewCategoryName('')
    setNewCategoryParentId(undefined)
  }

  const handleSaveLibrary = async () => {
    const name = newLibraryName.trim()
    if (!name) return
    await onSaveLibrary(name)
    setNewLibraryName('')
  }

  const categoryTree = flattenCategoryTree(categories)
  const editableCategories = categoryTree.filter(({ category }) => !isProtectedCategory(category))

  return (
    <div id="sample-browser-manage-panel" className="manage-panel" style={{ left: leftOffset }}>
      <TabsRoot value={tab} onValueChange={(value) => setTab(value as ManageTab)} activationMode="automatic">
      <TabsList className="manage-tabs" aria-label="Manage sample metadata">
        {(['tags', 'libraries', 'categories'] as const).map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            className={`manage-tab${tab === t ? ' manage-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="tags" className="manage-content">
          <ul className="manage-list">
            {tags.map((tag) => (
              <li key={tag.id} className="manage-list-item">
                <input
                  type="color"
                  className="manage-tag-color"
                  value={colorInputValue(tag.color)}
                  data-empty={tag.color === null ? 'true' : undefined}
                  aria-label={`Set color for tag ${tag.name}`}
                  onChange={(event) => void onSetTagColor(tag.id, event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="manage-action manage-tag-color-clear"
                  aria-label={`Clear color for tag ${tag.name}`}
                  disabled={tag.color === null}
                  onClick={() => void onSetTagColor(tag.id, null)}
                >Clear</button>
                {renamingTagId === tag.id ? (
                  <>
                    <input
                      type="text"
                      className="manage-input"
                      value={renameValue}
                      aria-label={`Rename tag ${tag.name}`}
                      onChange={(e) => setRenameValue(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCommitRename(tag.id)
                        if (e.key === 'Escape') { setRenamingTagId(null); setRenameValue('') }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="manage-action"
                      onClick={() => void handleCommitRename(tag.id)}
                      aria-label="Confirm rename"
                    >
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16">
                        <path d="m3 8.5 3 3L13 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="manage-name">{tag.name}</span>
                    <button
                      type="button"
                      className="manage-action"
                      aria-label={`Rename tag ${tag.name}`}
                      onClick={() => { setRenamingTagId(tag.id); setRenameValue(tag.name) }}
                    >
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16">
                        <path d="M3 13l.7-3.2L11 2.5 13.5 5l-7.3 7.3L3 13Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <path d="m9.8 3.7 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="manage-action manage-action-delete"
                      aria-label={`Delete tag ${tag.name}`}
                      onClick={() => void onDeleteTag(tag.id)}
                    >×</button>
                  </>
                )}
              </li>
            ))}
            {tags.length === 0 && (
              <li className="manage-empty">No tags yet.</li>
            )}
          </ul>
          <div className="manage-create manage-create-tag">
            <input
              type="text"
              className="manage-input"
              placeholder="New tag name"
              aria-label="New tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateTag() }}
            />
            <label className="manage-tag-color-toggle">
              <input
                type="checkbox"
                checked={newTagHasColor}
                onChange={(event) => setNewTagHasColor(event.currentTarget.checked)}
              />
              Color
            </label>
            <input
              type="color"
              className="manage-tag-color"
              value={newTagColor}
              disabled={!newTagHasColor}
              aria-label="New tag color"
              onChange={(event) => setNewTagColor(event.currentTarget.value)}
            />
            <button
              type="button"
              className="manage-create-btn"
              aria-label="Create tag"
              onClick={() => void handleCreateTag()}
              disabled={!newTagName.trim()}
            >Create Tag</button>
          </div>
      </TabsContent>

      <TabsContent value="libraries" className="manage-content">
          <ul className="manage-list">
            {libraries.map((lib) => (
              <li key={lib.id} className="manage-list-item">
                <Tooltip content={`Open ${lib.name} — restores its saved filters`}><button
                  type="button"
                  className="manage-name manage-name-open"
                  aria-label={`Open library ${lib.name}`}
                  onClick={() => onApplyLibrary(lib)}
                >{lib.name}</button></Tooltip>
                <button
                  type="button"
                  className="manage-action manage-action-delete"
                  aria-label={`Delete library ${lib.name}`}
                  onClick={() => void onDeleteLibrary(lib.id)}
                >×</button>
              </li>
            ))}
            {libraries.length === 0 && (
              <li className="manage-empty">No saved libraries yet.</li>
            )}
          </ul>
          <div className="manage-create">
            <input
              type="text"
              className="manage-input"
              placeholder="Library name"
              aria-label="New library name"
              value={newLibraryName}
              onChange={(e) => setNewLibraryName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveLibrary() }}
            />
            <button
              type="button"
              className="manage-create-btn"
              onClick={() => void handleSaveLibrary()}
              disabled={!newLibraryName.trim()}
            >Save current filters</button>
          </div>
      </TabsContent>

      <TabsContent value="categories" className="manage-content">
          <ul className="manage-list">
            {editableCategories.map(({ category, path }) => (
              <li key={category.id} className="manage-list-item">
                <span className="manage-name">{path}</span>
                <button
                  type="button"
                  className="manage-action manage-action-delete"
                  aria-label={`Delete category ${path}`}
                  onClick={() => void onDeleteCategory(category.id)}
                >×</button>
              </li>
            ))}
            {editableCategories.length === 0 && (
              <li className="manage-empty">No custom categories yet.</li>
            )}
          </ul>
          <div className="manage-create">
            <input
              type="text"
              className="manage-input"
              placeholder="New category"
              aria-label="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateCategory() }}
            />
            <select
              className="manage-select"
              aria-label="Parent category"
              value={newCategoryParentId ?? ''}
              onChange={(e) => setNewCategoryParentId(e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
            >
              <option value="">Root</option>
              {categoryTree.map(({ category, path }) => (
                <option key={category.id} value={category.id}>{path}</option>
              ))}
            </select>
            <button
              type="button"
              className="manage-create-btn"
              aria-label="Add category"
              onClick={() => void handleCreateCategory()}
              disabled={!newCategoryName.trim()}
            >+</button>
          </div>
      </TabsContent>
      </TabsRoot>
    </div>
  )
}
