import ScanOverlay from '../../src/renderer/src/components/ScanOverlay'

export function Scanning() {
  return (
    <ScanOverlay
      progress={{ status: 'scanning', phase: 1, found: 240, processed: 96, total: 240 }}
    />
  )
}

export function ScanningPhase2() {
  return (
    <ScanOverlay
      progress={{ status: 'scanning', phase: 2, found: 512, processed: 480, total: 512 }}
    />
  )
}
