import { forwardRef, useMemo, useState } from 'react'
import {
  isTagEditable,
  isTagRenameable,
  type LibraryItem,
  type TagItem
} from '../../../shared/backend-api'
import { filterTagsBySearch } from '../lib/tag-utils'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from './ui/Tabs'
import { Tooltip } from './ui/Tooltip'

type ManageTab = 'tags' | 'libraries'

interface ManagePanelProps {
  tags: TagItem[]
  libraries: LibraryItem[]
  onCreateTag: (name: string, color?: string) => Promise<TagItem>
  onRenameTag: (id: number, name: string) => Promise<void>
  onSetTagColor: (id: number, color: string | null) => Promise<void>
  onDeleteTag: (id: number) => Promise<void>
  onSaveLibrary: (name: string) => Promise<LibraryItem>
  onDeleteLibrary: (id: number) => Promise<void>
  onApplyLibrary: (library: LibraryItem) => void
}

const DEFAULT_TAG_COLOR = '#00674f'

function colorInputValue(color: string | null): string {
  if (!color) return DEFAULT_TAG_COLOR
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  return shortHex
    ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
    : DEFAULT_TAG_COLOR
}

const ManagePanel = forwardRef<HTMLDivElement, ManagePanelProps>(function ManagePanel({
  tags,
  libraries,
  onCreateTag,
  onRenameTag,
  onSetTagColor,
  onDeleteTag,
  onSaveLibrary,
  onDeleteLibrary,
  onApplyLibrary
}: ManagePanelProps, ref) {
  const [tab, setTab] = useState<ManageTab>('tags')
  const [tagSearch, setTagSearch] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR)
  const [newTagHasColor, setNewTagHasColor] = useState(false)
  const [renamingTagId, setRenamingTagId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newLibraryName, setNewLibraryName] = useState('')

  const visibleTags = useMemo(() => filterTagsBySearch(tags, tagSearch), [tagSearch, tags])

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    await onCreateTag(name, newTagHasColor ? newTagColor : undefined)
    setNewTagName('')
    setNewTagHasColor(false)
  }

  const handleCommitRename = async (id: number) => {
    const name = renameValue.trim()
    if (name) await onRenameTag(id, name)
    setRenamingTagId(null)
    setRenameValue('')
  }

  const handleSaveLibrary = async () => {
    const name = newLibraryName.trim()
    if (!name) return
    await onSaveLibrary(name)
    setNewLibraryName('')
  }

  return (
    <div
      ref={ref}
      id="sample-browser-manage-panel"
      className="manage-panel"
      role="region"
      aria-label="Manage tags and libraries"
      tabIndex={-1}
    >
      <TabsRoot value={tab} onValueChange={(value) => setTab(value as ManageTab)} activationMode="automatic">
        <TabsList className="manage-tabs" aria-label="Manage sample metadata">
          {(['tags', 'libraries'] as const).map((item) => (
            <TabsTrigger
              key={item}
              value={item}
              className={`manage-tab${tab === item ? ' manage-tab-active' : ''}`}
              onClick={() => setTab(item)}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="tags" className="manage-content">
          <input
            type="search"
            className="manage-input manage-search"
            value={tagSearch}
            onChange={(event) => setTagSearch(event.currentTarget.value)}
            placeholder="Search tags"
            aria-label="Search managed tags"
          />
          <ul className="manage-list">
            {visibleTags.map((tag) => {
              const editable = isTagEditable(tag.origin)
              const renameable = isTagRenameable(tag.origin)
              return (
              <li key={tag.id} className="manage-list-item">
                <input
                  type="color"
                  className="manage-tag-color"
                  value={colorInputValue(tag.color)}
                  data-empty={tag.color === null ? 'true' : undefined}
                  aria-label={`Set color for tag ${tag.name}`}
                  disabled={!editable}
                  onChange={(event) => void onSetTagColor(tag.id, event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="manage-action manage-tag-color-clear"
                  aria-label={`Clear color for tag ${tag.name}`}
                  disabled={!editable || tag.color === null}
                  onClick={() => void onSetTagColor(tag.id, null)}
                >Clear</button>
                {renameable && renamingTagId === tag.id ? (
                  <>
                    <input
                      type="text"
                      className="manage-input"
                      value={renameValue}
                      aria-label={`Rename tag ${tag.name}`}
                      onChange={(event) => setRenameValue(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleCommitRename(tag.id)
                        if (event.key === 'Escape') { setRenamingTagId(null); setRenameValue('') }
                      }}
                      autoFocus
                    />
                    <button type="button" className="manage-action" onClick={() => void handleCommitRename(tag.id)} aria-label="Confirm rename">
                      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16">
                        <path d="m3 8.5 3 3L13 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </>
                ) : editable ? (
                  <>
                    <span className="manage-name">
                      {tag.name}
                      {tag.folderDerived && <small className="manage-tag-source">Also from folder</small>}
                    </span>
                    {renameable && (
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
                    )}
                    <button type="button" className="manage-action manage-action-delete" aria-label={`Delete tag ${tag.name}`} onClick={() => void onDeleteTag(tag.id)}>×</button>
                  </>
                ) : (
                  <span className="manage-name">
                    {tag.name}
                    <small className="manage-tag-source">From folder</small>
                  </span>
                )}
              </li>
              )
            })}
            {visibleTags.length === 0 && (
              <li className="manage-empty">{tags.length === 0 ? 'No tags yet.' : 'No matching tags.'}</li>
            )}
          </ul>
          <div className="manage-create manage-create-tag">
            <input
              type="text"
              className="manage-input"
              placeholder="New tag name"
              aria-label="New tag name"
              value={newTagName}
              onChange={(event) => setNewTagName(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateTag() }}
            />
            <label className="manage-tag-color-toggle">
              <input type="checkbox" checked={newTagHasColor} onChange={(event) => setNewTagHasColor(event.currentTarget.checked)} />
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
            <button type="button" className="manage-create-btn" aria-label="Create tag" onClick={() => void handleCreateTag()} disabled={!newTagName.trim()}>Create Tag</button>
          </div>
        </TabsContent>

        <TabsContent value="libraries" className="manage-content">
          <ul className="manage-list">
            {libraries.map((library) => (
              <li key={library.id} className="manage-list-item">
                <Tooltip content={`Open ${library.name} — restores its saved filters`}>
                  <button type="button" className="manage-name manage-name-open" aria-label={`Open library ${library.name}`} onClick={() => onApplyLibrary(library)}>{library.name}</button>
                </Tooltip>
                <button type="button" className="manage-action manage-action-delete" aria-label={`Delete library ${library.name}`} onClick={() => void onDeleteLibrary(library.id)}>×</button>
              </li>
            ))}
            {libraries.length === 0 && <li className="manage-empty">No saved libraries yet.</li>}
          </ul>
          <div className="manage-create">
            <input
              type="text"
              className="manage-input"
              placeholder="Library name"
              aria-label="New library name"
              value={newLibraryName}
              onChange={(event) => setNewLibraryName(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void handleSaveLibrary() }}
            />
            <button type="button" className="manage-create-btn" onClick={() => void handleSaveLibrary()} disabled={!newLibraryName.trim()}>Save current filters</button>
          </div>
        </TabsContent>
      </TabsRoot>
    </div>
  )
})

export default ManagePanel
