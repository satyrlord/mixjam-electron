import FolderCard from './FolderCard'
import type { FolderView } from '../hooks/useFolderSession'

interface HomeScreenProps {
  userFolder: FolderView
  sampleFolder: FolderView
  canStart: boolean
  onPickUser: () => void
  onPickSample: () => void
  onStart: () => void
  onLoad: () => void
}

const userIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1z" />
    <path d="M10 9v4M8 11h4" strokeLinecap="round" />
  </svg>
)

const sampleIcon = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 1.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1z" />
    <path d="M8 8.5v4.5M8 8.5l4-1v4.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="7" cy="13" r="1" />
    <circle cx="11" cy="12" r="1" />
  </svg>
)

export default function HomeScreen({
  userFolder,
  sampleFolder,
  canStart,
  onPickUser,
  onPickSample,
  onStart,
  onLoad
}: HomeScreenProps) {
  const sampleDisabled = userFolder.status !== 'set'

  return (
    <div className="home-screen">
      <div className="home-content">
        <FolderCard
          label="User Folder"
          icon={userIcon}
          path={userFolder.path}
          status={userFolder.status}
          disabled={false}
          emptyPrompt="Choose where MixJam saves your projects and exports."
          onPick={onPickUser}
        />
        <FolderCard
          label="Sample Folder"
          icon={sampleIcon}
          path={sampleFolder.path}
          status={sampleFolder.status}
          disabled={sampleDisabled}
          emptyPrompt="Choose the folder that holds your sample library."
          onPick={onPickSample}
        />

        <div className="home-launch">
          <button className="btn-primary" onClick={onStart} disabled={!canStart}>
            Start New MixJam
          </button>
          {!canStart && <p className="home-launch-hint">Select both folders above to start.</p>}
        </div>

        <button className="link-secondary" onClick={onLoad}>
          Load MixJam
        </button>
      </div>
    </div>
  )
}
