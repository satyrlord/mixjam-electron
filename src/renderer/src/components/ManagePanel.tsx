import { useState } from 'react'
import type { CategoryItem, LibraryItem, TagItem } from '../../../shared/backend-api'
import { ROOT_CATEGORY_NAMES } from '../lib/sample-utils'

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
  onDeleteTag: (id: number) => Promise<void>
  onCreateCategory: (name: string, parentId?: number) => Promise<CategoryItem>
  onDeleteCategory: (id: number) => Promise<void>
  onSaveLibrary: (name: string) => Promise<LibraryItem>
  onDeleteLibrary: (id: number) => Promise<void>
  onApplyLibrary: (library: LibraryItem) => void
}

const isRootHardcoded = (name: string) => ROOT_CATEGORY_NAMES.includes(name)

export default function ManagePanel({
  tags,
  libraries,
  categories,
  leftOffset,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  onCreateCategory,
  onDeleteCategory,
  onSaveLibrary,
  onDeleteLibrary,
  onApplyLibrary
}: ManagePanelProps) {
  const [tab, setTab] = useState<ManageTab>('tags')

  const [newTagName, setNewTagName] = useState('')
  const [renamingTagId, setRenamingTagId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | undefined>(undefined)

  const [newLibraryName, setNewLibraryName] = useState('')

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    await onCreateTag(name)
    setNewTagName('')
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

  const rootCategories = categories.filter((c) => c.parentId === null)

  return (
    <div className="manage-panel" style={{ left: leftOffset }}>
      <div className="manage-tabs" role="tablist">
        {(['tags', 'libraries', 'categories'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={`manage-tab${tab === t ? ' manage-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tags' && (
        <div className="manage-content">
          <ul className="manage-list">
            {tags.map((tag) => (
              <li key={tag.id} className="manage-list-item">
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
                    <button type="button" onClick={() => void handleCommitRename(tag.id)} aria-label="Confirm rename">
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
          </ul>
          <div className="manage-create">
            <input
              type="text"
              className="manage-input"
              placeholder="New tag name"
              aria-label="New tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateTag() }}
            />
            <button
              type="button"
              className="manage-create-btn"
              aria-label="Create tag"
              onClick={() => void handleCreateTag()}
              disabled={!newTagName.trim()}
            >Create Tag</button>
          </div>
        </div>
      )}

      {tab === 'libraries' && (
        <div className="manage-content">
          <ul className="manage-list">
            {libraries.map((lib) => (
              <li key={lib.id} className="manage-list-item">
                <button
                  type="button"
                  className="manage-name manage-name-open"
                  title={`Open ${lib.name} — restores its saved filters`}
                  aria-label={`Open library ${lib.name}`}
                  onClick={() => onApplyLibrary(lib)}
                >{lib.name}</button>
                <button
                  type="button"
                  className="manage-action manage-action-delete"
                  aria-label={`Delete library ${lib.name}`}
                  onClick={() => void onDeleteLibrary(lib.id)}
                >×</button>
              </li>
            ))}
            {libraries.length === 0 && (
              <p className="manage-empty">No saved libraries yet.</p>
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
        </div>
      )}

      {tab === 'categories' && (
        <div className="manage-content">
          <ul className="manage-list">
            {rootCategories.filter((c) => !isRootHardcoded(c.name)).map((cat) => (
              <li key={cat.id} className="manage-list-item">
                <span className="manage-name">{cat.name}</span>
                <button
                  type="button"
                  className="manage-action manage-action-delete"
                  aria-label={`Delete category ${cat.name}`}
                  onClick={() => void onDeleteCategory(cat.id)}
                >×</button>
              </li>
            ))}
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
              {rootCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
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
        </div>
      )}
    </div>
  )
}
