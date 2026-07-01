import ScanProgressBar from '../../src/renderer/src/components/ScanProgressBar'

export function Scanning() {
  return (
    <ScanProgressBar
      progress={{ status: 'scanning', phase: 1, found: 240, processed: 96, total: 240 }}
    />
  )
}

export function Error() {
  return (
    <ScanProgressBar
      progress={{ status: 'error', phase: null, found: 0, processed: 0, total: 0 }}
    />
  )
}
