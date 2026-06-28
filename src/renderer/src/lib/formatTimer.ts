export function formatTimer(ms: number): string {
  const totalTenths = Math.floor(ms / 100)
  const tenths = totalTenths % 10
  const totalSeconds = Math.floor(totalTenths / 10)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`
}
