import FolderCard from '../../src/renderer/src/components/FolderCard'

const userIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1z" />
    <path d="M10 9v4M8 11h4" strokeLinecap="round" />
  </svg>
)

export function Empty() {
  return (
    <FolderCard
      label="User Folder"
      icon={userIcon}
      path={null}
      status="empty"
      disabled={false}
      emptyPrompt="Choose where MixJam saves your projects and exports."
      onPick={() => {}}
    />
  )
}

export function Set() {
  return (
    <FolderCard
      label="User Folder"
      icon={userIcon}
      path="C:/Users/dj/MixJam Projects"
      status="set"
      disabled={false}
      emptyPrompt="Choose where MixJam saves your projects and exports."
      onPick={() => {}}
    />
  )
}

export function Disabled() {
  return (
    <FolderCard
      label="Sample Folder"
      icon={userIcon}
      path={null}
      status="empty"
      disabled={true}
      emptyPrompt="Choose the folder that holds your sample library."
      onPick={() => {}}
    />
  )
}

export function PickError() {
  return (
    <FolderCard
      label="Sample Folder"
      icon={userIcon}
      path={null}
      status="pick-error"
      disabled={false}
      emptyPrompt="Choose the folder that holds your sample library."
      onPick={() => {}}
    />
  )
}
