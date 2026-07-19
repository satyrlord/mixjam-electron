import type { FooterSampleDetail } from '../lib/arrangement'
import WaveformPreview from './WaveformPreview'
import { Tooltip } from './ui/Tooltip'
import { UI_SIZE_OPTIONS, type UiSize } from '../ui-size'

interface FooterProps {
  view: 'home' | 'player'
  version: string
  sampleDetail: FooterSampleDetail | null
  onSelectFolder: () => void
  onOpenRepo: () => void
  getSampleBuffer?: (samplePath: string) => Promise<AudioBuffer | null>
  uiSize?: UiSize
  onUiSizeChange?: (size: UiSize) => void
}

export default function Footer({
  view,
  version,
  sampleDetail,
  onSelectFolder,
  onOpenRepo,
  getSampleBuffer,
  uiSize = 40,
  onUiSizeChange = () => undefined
}: FooterProps) {
  return (
    <footer className="footer">
      <Tooltip content="Choose where MixJam saves your projects and app settings">
        <button type="button" className="footer-link" onClick={onSelectFolder}>Select User Folder</button>
      </Tooltip>
      <div className="footer-detail" aria-live="polite">
        {view === 'player' && sampleDetail ? (
          <>
            <span className="footer-detail-name">{sampleDetail.name}</span>
            {getSampleBuffer ? (
              <WaveformPreview filepath={sampleDetail.relpath} getSampleBuffer={getSampleBuffer} />
            ) : null}
            <span className="footer-detail-path">{sampleDetail.relpath}</span>
            <span className="footer-detail-tags">{sampleDetail.tags.join(', ')}</span>
          </>
        ) : null}
      </div>
      <div className="footer-preferences">
        <div className="footer-ui-size" role="group" aria-label="UI Size">
          {UI_SIZE_OPTIONS.map((size) => (
            <button
              type="button"
              key={size}
              aria-pressed={uiSize === size}
              onClick={() => onUiSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
        <button type="button" className="footer-link" onClick={onOpenRepo}>
          {version}
        </button>
      </div>
    </footer>
  )
}
