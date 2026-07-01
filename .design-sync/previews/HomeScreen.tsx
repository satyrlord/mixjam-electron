import HomeScreen from '../../src/renderer/src/components/HomeScreen'
import type { FolderView } from '../../src/renderer/src/hooks/useFolderSession'

const EMPTY: FolderView = { path: null, status: 'empty' }
const USER_SET: FolderView = { path: 'C:/Users/dj/MixJam Projects', status: 'set' }
const SAMPLE_SET: FolderView = { path: 'D:/Samples/MixJam Library', status: 'set' }

export function BothEmpty() {
  return (
    <HomeScreen
      userFolder={EMPTY}
      sampleFolder={EMPTY}
      canStart={false}
      onPickUser={() => {}}
      onPickSample={() => {}}
      onStart={() => {}}
      onLoad={() => {}}
    />
  )
}

export function ReadyToStart() {
  return (
    <HomeScreen
      userFolder={USER_SET}
      sampleFolder={SAMPLE_SET}
      canStart={true}
      onPickUser={() => {}}
      onPickSample={() => {}}
      onStart={() => {}}
      onLoad={() => {}}
    />
  )
}
