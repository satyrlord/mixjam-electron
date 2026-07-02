import { useEffect, useRef } from 'react'

// Compact waveform rendered in the footer for the selected sample. The buffer
// comes from the engine's sample cache, so selecting a sample (which also
// previews it) costs a single decode shared with playback.

const BUCKET_COUNT = 100

interface WaveformPreviewProps {
  filepath: string | null
  getSampleBuffer: (samplePath: string) => Promise<AudioBuffer | null>
}

// Per-bucket peak amplitude (0..1) across all channels.
export function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const peaks = new Array<number>(buckets).fill(0)
  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / buckets))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let b = 0; b < buckets; b++) {
      const start = b * samplesPerBucket
      const end = Math.min(start + samplesPerBucket, data.length)
      let peak = peaks[b]
      for (let i = start; i < end; i++) {
        const amplitude = Math.abs(data[i])
        if (amplitude > peak) peak = amplitude
      }
      peaks[b] = peak
    }
  }
  return peaks
}

export default function WaveformPreview({ filepath, getSampleBuffer }: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 200
    const height = canvas.clientHeight || 22
    canvas.width = width * dpr
    canvas.height = height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)
    if (!filepath) return

    let stale = false
    void getSampleBuffer(filepath).then((buffer) => {
      if (stale || !buffer) return
      const peaks = computePeaks(buffer, BUCKET_COUNT)
      const rootStyle = getComputedStyle(document.documentElement)
      const waveColor = rootStyle.getPropertyValue('--highlight').trim() || '#8FBCB2'

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = waveColor
      const barWidth = width / BUCKET_COUNT
      const mid = height / 2
      for (let b = 0; b < BUCKET_COUNT; b++) {
        // Minimum 1px spike so silent stretches still read as a waveform.
        const barHeight = Math.max(1, peaks[b] * (height - 2))
        ctx.fillRect(b * barWidth, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight)
      }
    })
    return () => {
      stale = true
    }
  }, [filepath, getSampleBuffer])

  return (
    <canvas
      ref={canvasRef}
      className="footer-waveform"
      role="img"
      aria-label={filepath ? 'Selected sample waveform' : ''}
      aria-hidden={filepath ? undefined : true}
    />
  )
}
