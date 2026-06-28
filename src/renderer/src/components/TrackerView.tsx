import type { RecentProjectItem, SampleBrowserItem } from '../../../shared/ipc'
import type { FooterSampleDetail, LaneState } from '../lib/playerShell'
import { DEFAULT_CLIP_DURATION_TICKS, LANE_HEAD_WIDTH_PX, LANE_HEIGHT_PX } from '../lib/playerShell'

interface TrackerViewProps {
  recentProjects: RecentProjectItem[]
  sampleRows: SampleBrowserItem[]
  sampleSearchQuery: string
  sampleBrowserLoading: boolean
  sampleBrowserError: string | null
  selectedSamplePath: string | null
  lanes: LaneState[]
  laneShouldDim: (lane: LaneState) => boolean
  transportState: 'stopped' | 'playing' | 'paused'
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onSampleSearchChange: (query: string) => void
  onSampleRescan: () => void
  onPlaceSampleOnLane: (laneIndex: number, startTick: number) => void
  onToggleLaneMute: (laneIndex: number) => void
  onToggleLaneSolo: (laneIndex: number) => void
  onTransportPlay: () => void
  onTransportPause: () => void
  onTransportStop: () => void
  onTransportSkipBack: () => void
}

function nearestTick(clickX: number, containerWidth: number, totalTicks: number): number {
  const tickWidth = containerWidth / totalTicks
  const tick = Math.floor(clickX / tickWidth)
  // Clamp so a placed clip (DEFAULT_CLIP_DURATION_TICKS wide) always fits
  // within the timeline instead of rendering off-canvas past the right edge.
  const maxStartTick = Math.max(0, totalTicks - DEFAULT_CLIP_DURATION_TICKS)
  return Math.min(Math.max(0, tick), maxStartTick)
}

export default function TrackerView({
  recentProjects,
  sampleRows,
  sampleSearchQuery,
  sampleBrowserLoading,
  sampleBrowserError,
  selectedSamplePath,
  lanes,
  laneShouldDim,
  transportState,
  onSelectSampleDetail,
  onSampleSearchChange,
  onSampleRescan,
  onPlaceSampleOnLane,
  onToggleLaneMute,
  onToggleLaneSolo,
  onTransportPlay,
  onTransportPause,
  onTransportStop,
  onTransportSkipBack
}: TrackerViewProps) {
  const totalTicks = 256

  const handleLaneCanvasClick = (laneIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedSamplePath) return
    const rect = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const tick = nearestTick(clickX, rect.width, totalTicks)
    onPlaceSampleOnLane(laneIndex, tick)
  }

  const isPlaying = transportState === 'playing'

  return (
    <div className="tracker-view">
      <aside className="tracker-zone recent-projects-rail">
        <h2 className="tracker-zone-title">Recent Projects</h2>
        {recentProjects.length === 0 ? (
          <p className="recent-projects-empty">
            No MixJam projects yet. Save the current project or open an existing .mixjam file to
            populate this rail.
          </p>
        ) : (
          <ol className="recent-projects-list">
            {recentProjects.map((project) => (
              <li key={project.path} className="recent-projects-item">
                <span className="recent-projects-name">{project.displayName}</span>
                <span className="recent-projects-path">{project.path}</span>
              </li>
            ))}
          </ol>
        )}
      </aside>

      <section className="tracker-zone tracker-region">
        <div className="tracker-ruler">
          <div className="tracker-ruler-spacer" />
          {Array.from({ length: totalTicks / 32 }, (_, i) => (
            <div key={i} className="tracker-ruler-tick">
              {i % 4 === 0 ? <span className="tracker-ruler-bar">{i + 1}</span> : null}
            </div>
          ))}
        </div>

        <div className="tracker-lanes">
          {lanes.map((lane) => {
            const tickWidth = `calc(100% / ${totalTicks})`
            const dimmed = laneShouldDim(lane)

            return (
              <div
                key={lane.index}
                className={`tracker-lane${dimmed ? ' tracker-lane-dimmed' : ''}`}
                style={{ height: LANE_HEIGHT_PX }}
              >
                <div className="tracker-lane-head" style={{ width: LANE_HEAD_WIDTH_PX }}>
                  <span className="tracker-lane-name">{lane.name}</span>
                  <button
                    type="button"
                    className={`tracker-lane-mute${lane.muted ? ' tracker-lane-mute-active' : ''}`}
                    aria-label={`Mute ${lane.name}`}
                    onClick={() => onToggleLaneMute(lane.index)}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    className={`tracker-lane-solo${lane.solo ? ' tracker-lane-solo-active' : ''}`}
                    aria-label={`Solo ${lane.name}`}
                    onClick={() => onToggleLaneSolo(lane.index)}
                  >
                    S
                  </button>
                  <span className="tracker-lane-pan" aria-hidden="true">C</span>
                </div>

                <div
                  className="tracker-lane-canvas"
                  onClick={(event) => handleLaneCanvasClick(lane.index, event)}
                  role="button"
                  aria-label={`Place sample on ${lane.name}`}
                  tabIndex={0}
                >
                  {lane.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className="tracker-lane-clip"
                      style={{
                        left: `calc(${clip.startTick} * ${tickWidth})`,
                        width: `calc(${clip.durationTicks} * ${tickWidth})`
                      }}
                      title={clip.sampleName}
                    >
                      <span className="tracker-lane-clip-label">{clip.sampleName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="tracker-zone middle-strip">
        <span className="middle-strip-project">Untitled</span>
        <div className="middle-strip-controls">
          <button
            type="button"
            className="transport-button"
            onClick={onTransportSkipBack}
          >
            Skip Back
          </button>
          <button
            type="button"
            className={`transport-button${isPlaying ? ' transport-button-active' : ''}`}
            onClick={isPlaying ? onTransportPause : onTransportPlay}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="transport-button"
            onClick={onTransportStop}
          >
            Stop
          </button>
        </div>
        <span className="middle-strip-bpm">120 BPM</span>
      </section>

      <aside className="tracker-zone song-controls-rail">
        <h2 className="tracker-zone-title">Song Controls</h2>
        <label className="song-control">
          <span>Master Volume</span>
          <input type="range" min="0" max="100" defaultValue="80" />
        </label>
        <div className="song-control">
          <span>dB Loudness</span>
          <div className="loudness-meter" aria-hidden="true">
            <div className="loudness-meter-fill" />
          </div>
        </div>
        <label className="song-control">
          <span>BPM</span>
          <input type="range" min="50" max="200" defaultValue="120" />
        </label>
      </aside>

      <section className="tracker-zone browser-region">
        <div className="browser-tree">
          <h2 className="tracker-zone-title">Category Tree</h2>
          <ul className="browser-tree-list">
            <li>Drums</li>
            <li>Bass</li>
            <li>FX</li>
          </ul>
        </div>

        <div className="browser-pane">
          <div className="browser-toolbar">
            <input
              type="search"
              className="browser-search"
              placeholder="Search samples"
              aria-label="Search samples"
              value={sampleSearchQuery}
              onChange={(event) => onSampleSearchChange(event.currentTarget.value)}
            />
            <span className="browser-results">{sampleRows.length} results</span>
            <button
              type="button"
              className="browser-rescan"
              onClick={onSampleRescan}
              disabled={sampleBrowserLoading}
            >
              {sampleBrowserLoading ? 'Scanning…' : 'Re-scan'}
            </button>
          </div>

          <div className="sample-list-header">
            <span>Filename</span>
            <span>Category</span>
            <span>Duration</span>
          </div>

          <div className="sample-list-viewport">
            {sampleRows.map((sample) => {
              const selected = selectedSamplePath === sample.path
              return (
                <button
                  key={sample.id}
                  type="button"
                  className={`sample-row${selected ? ' sample-row-selected' : ''}`}
                  onClick={() => onSelectSampleDetail(sample)}
                >
                  <span>{sample.name}</span>
                  <span>{sample.category}</span>
                  <span>{sample.duration}</span>
                </button>
              )
            })}
            {!sampleBrowserLoading && sampleRows.length === 0 && sampleBrowserError ? (
              <p className="sample-list-empty">{sampleBrowserError}</p>
            ) : null}
            {!sampleBrowserLoading && sampleRows.length === 0 && !sampleBrowserError ? (
              <p className="sample-list-empty">No samples match the current query.</p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
