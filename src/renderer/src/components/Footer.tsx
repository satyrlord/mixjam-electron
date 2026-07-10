import type { FooterSampleDetail } from '../lib/arrangement'
import WaveformPreview from './WaveformPreview'

interface FooterProps {
  view: 'home' | 'player'
  version: string
  sampleDetail: FooterSampleDetail | null
  onSelectFolder: () => void
  onOpenRepo: () => void
  getSampleBuffer?: (samplePath: string) => Promise<AudioBuffer | null>
}

export default function Footer({
  view,
  version,
  sampleDetail,
  onSelectFolder,
  onOpenRepo,
  getSampleBuffer
}: FooterProps) {
  return (
    <footer className="footer">
      <button
        type="button"
        className="footer-link"
        title="Choose where MixJam saves your projects and app settings"
        onClick={onSelectFolder}
      >
        Select User Folder
      </button>
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
      <button type="button" className="footer-link" onClick={onOpenRepo}>
        {version}
      </button>
    </footer>
  )
}
