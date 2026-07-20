import type { Ref } from 'react'
import type { FooterSampleDetail } from '../lib/arrangement'
import WaveformPreview from './WaveformPreview'
import { Tooltip } from './ui/Tooltip'

interface FooterProps {
  view: 'home' | 'player'
  version: string
  sampleDetail: FooterSampleDetail | null
  onOpenSettings: () => void
  settingsButtonRef?: Ref<HTMLButtonElement>
  onOpenRepo: () => void
  getSampleBuffer?: (samplePath: string) => Promise<AudioBuffer | null>
}

export default function Footer({
  view,
  version,
  sampleDetail,
  onOpenSettings,
  settingsButtonRef,
  onOpenRepo,
  getSampleBuffer
}: FooterProps) {
  return (
    <footer className="footer">
      {view === 'player' ? (
        <Tooltip content="Open application and project settings">
          <button
            ref={settingsButtonRef}
            type="button"
            className="footer-link"
            onClick={onOpenSettings}
          >
            Settings
          </button>
        </Tooltip>
      ) : <span aria-hidden="true" />}
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
        <button type="button" className="footer-link" onClick={onOpenRepo}>
          {version}
        </button>
      </div>
    </footer>
  )
}
