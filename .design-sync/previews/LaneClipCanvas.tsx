import type { ReactNode } from 'react'
import LaneClipCanvas from '../../src/renderer/src/components/LaneClipCanvas'
import type { LaneClip } from '../../src/renderer/src/lib/playerShell'

// The canvas measures its container's getBoundingClientRect() to size and draw
// itself, and reads --accent/--border via getComputedStyle at draw time — it
// needs a concretely sized, themed ancestor, not an auto-height wrapper.
function LaneHost({ children }: { children: ReactNode }) {
  return <div style={{ width: 640, height: 44 }}>{children}</div>
}

const CLIPS: LaneClip[] = [
  { id: 'clip-1', samplePath: 'C:/Samples/Drums/Kicks/kick_808.wav', sampleName: 'kick_808.wav', startTick: 0, durationTicks: 32, durationSeconds: 0.8, color: '#E4572E' },
  { id: 'clip-2', samplePath: 'C:/Samples/Bass/sub_growl.wav', sampleName: 'sub_growl.wav', startTick: 48, durationTicks: 48, durationSeconds: 2.4, color: '#2D8C6F' },
  { id: 'clip-3', samplePath: 'C:/Samples/FX/riser_white_noise.wav', sampleName: 'riser_white_noise.wav', startTick: 112, durationTicks: 16, durationSeconds: 4.1 }
]

export function Populated() {
  return (
    <LaneHost>
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={128}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={() => {}}
        onClipContextMenu={() => {}}
      />
    </LaneHost>
  )
}

export function WithSelection() {
  return (
    <LaneHost>
      <LaneClipCanvas
        clips={CLIPS}
        totalTicks={128}
        laneIndex={0}
        flashSamplePath="C:/Samples/Drums/Kicks/kick_808.wav"
        selectedClipIds={new Set(['clip-2'])}
        onClipDragStart={() => {}}
        onClipContextMenu={() => {}}
      />
    </LaneHost>
  )
}

export function Empty() {
  return (
    <LaneHost>
      <LaneClipCanvas
        clips={[]}
        totalTicks={128}
        laneIndex={0}
        flashSamplePath={null}
        selectedClipIds={new Set()}
        onClipDragStart={() => {}}
        onClipContextMenu={() => {}}
      />
    </LaneHost>
  )
}
