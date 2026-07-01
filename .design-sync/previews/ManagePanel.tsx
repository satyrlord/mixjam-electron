import type { ReactNode } from 'react'
import ManagePanel from '../../src/renderer/src/components/ManagePanel'
import type { CategoryItem, LibraryItem, TagItem } from '../../src/shared/ipc'

// .manage-panel is absolutely positioned (top/left/right/bottom: 0) against the
// tracker's positioned container in the real app; a bare preview root has no
// such ancestor, so bottom:0 has no reference and .manage-content collapses to
// 0 height. Reproduce that positioned, sized ancestor here.
function TrackerHost({ children }: { children: ReactNode }) {
  return <div style={{ position: 'relative', width: 640, height: 420 }}>{children}</div>
}

const TAGS: TagItem[] = [
  { id: 1, name: 'Punchy', color: '#E4572E' },
  { id: 2, name: 'Warm', color: '#2D8C6F' },
  { id: 3, name: 'Vintage', color: null },
  { id: 4, name: 'Distorted', color: '#8E44AD' }
]

const CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Kicks', parentId: null },
  { id: 2, name: 'Snares', parentId: null },
  { id: 3, name: 'Hats', parentId: null },
  { id: 4, name: 'Trap Kicks', parentId: 1 }
]

const LIBRARIES: LibraryItem[] = [
  { id: 1, name: 'My Deep House Kit', createdAt: Date.now() - 86_400_000, ruleJson: '{}' },
  { id: 2, name: 'Punchy Trap Drums', createdAt: Date.now() - 3_600_000, ruleJson: '{}' }
]

async function noopTag(): Promise<TagItem> {
  return { id: 99, name: 'New Tag', color: null }
}
async function noopCategory(): Promise<CategoryItem> {
  return { id: 99, name: 'New Category', parentId: null }
}
async function noopLibrary(): Promise<LibraryItem> {
  return { id: 99, name: 'New Library', createdAt: Date.now(), ruleJson: '{}' }
}

export function Tags() {
  return (
    <TrackerHost>
      <ManagePanel
        tags={TAGS}
        libraries={LIBRARIES}
        categories={CATEGORIES}
        onCreateTag={noopTag}
        onRenameTag={async () => {}}
        onDeleteTag={async () => {}}
        onCreateCategory={noopCategory}
        onDeleteCategory={async () => {}}
        onSaveLibrary={noopLibrary}
        onDeleteLibrary={async () => {}}
      />
    </TrackerHost>
  )
}

export function EmptyState() {
  return (
    <TrackerHost>
      <ManagePanel
        tags={[]}
        libraries={[]}
        categories={CATEGORIES}
        onCreateTag={noopTag}
        onRenameTag={async () => {}}
        onDeleteTag={async () => {}}
        onCreateCategory={noopCategory}
        onDeleteCategory={async () => {}}
        onSaveLibrary={noopLibrary}
        onDeleteLibrary={async () => {}}
      />
    </TrackerHost>
  )
}
