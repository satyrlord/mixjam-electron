interface FooterProps {
  version: string
  onSelectFolder: () => void
  onOpenRepo: () => void
}

export default function Footer({ version, onSelectFolder, onOpenRepo }: FooterProps) {
  return (
    <footer className="footer">
      <button type="button" className="footer-link" onClick={onSelectFolder}>
        Select settings folder
      </button>
      <button type="button" className="footer-link" onClick={onOpenRepo}>
        {version}
      </button>
    </footer>
  )
}
