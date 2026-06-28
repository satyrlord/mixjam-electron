import type { FooterSampleDetail } from '../lib/playerShell'

interface FooterProps {
  view: 'home' | 'tracker'
  version: string
  sampleDetail: FooterSampleDetail | null
  onSelectFolder: () => void
  onOpenRepo: () => void
}

export default function Footer({ view, version, sampleDetail, onSelectFolder, onOpenRepo }: FooterProps) {
  return (
    <footer className="footer">
      <button type="button" className="footer-link" onClick={onSelectFolder}>
        Select settings folder
      </button>
      <div className="footer-detail" aria-live="polite">
        {view === 'tracker' && sampleDetail ? (
          <>
            <span className="footer-detail-name">{sampleDetail.name}</span>
            <span className="footer-detail-path">{sampleDetail.path}</span>
            <span className="footer-detail-meta">{sampleDetail.metadata.join(' • ')}</span>
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
