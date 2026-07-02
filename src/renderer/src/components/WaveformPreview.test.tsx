import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WaveformPreview, { computePeaks } from './WaveformPreview'

function makeMockCtx() {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn()
  }
}

// Minimal AudioBuffer stand-in: one channel ramping 0..1.
function makeMockBuffer(length = 1000, channels = 1): AudioBuffer {
  const data = Float32Array.from({ length }, (_, i) => i / length)
  return {
    length,
    numberOfChannels: channels,
    getChannelData: () => data
  } as unknown as AudioBuffer
}

describe('WaveformPreview', () => {
  let mockCtx: ReturnType<typeof makeMockCtx>
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    mockCtx = makeMockCtx()
    originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx)
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1)
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('loads the buffer for the given filepath and draws peak bars', async () => {
    const getSampleBuffer = vi.fn().mockResolvedValue(makeMockBuffer())
    render(<WaveformPreview filepath="C:/kick.wav" getSampleBuffer={getSampleBuffer} />)

    expect(getSampleBuffer).toHaveBeenCalledWith('C:/kick.wav')
    await waitFor(() => expect(mockCtx.fillRect).toHaveBeenCalled())
    // One bar per bucket
    expect(mockCtx.fillRect).toHaveBeenCalledTimes(100)
  })

  it('renders an empty, hidden canvas when no sample is selected', () => {
    const getSampleBuffer = vi.fn()
    const { container } = render(
      <WaveformPreview filepath={null} getSampleBuffer={getSampleBuffer} />
    )

    expect(getSampleBuffer).not.toHaveBeenCalled()
    expect(mockCtx.fillRect).not.toHaveBeenCalled()
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not draw a stale waveform after the filepath changes', async () => {
    let resolveFirst: (buffer: AudioBuffer) => void = () => {}
    const firstLoad = new Promise<AudioBuffer>((resolve) => {
      resolveFirst = resolve
    })
    const getSampleBuffer = vi
      .fn()
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValueOnce(makeMockBuffer())

    const { rerender } = render(
      <WaveformPreview filepath="C:/slow.wav" getSampleBuffer={getSampleBuffer} />
    )
    rerender(<WaveformPreview filepath="C:/fast.wav" getSampleBuffer={getSampleBuffer} />)

    await waitFor(() => expect(mockCtx.fillRect).toHaveBeenCalledTimes(100))
    mockCtx.fillRect.mockClear()

    // The superseded load resolving late must not repaint over the new waveform.
    resolveFirst(makeMockBuffer())
    await firstLoad
    expect(mockCtx.fillRect).not.toHaveBeenCalled()
  })
})

describe('computePeaks', () => {
  it('returns the per-bucket peak amplitude across channels', () => {
    const left = new Float32Array([0.1, 0.2, -0.9, 0.0])
    const right = new Float32Array([0.5, -0.1, 0.3, 0.4])
    const buffer = {
      length: 4,
      numberOfChannels: 2,
      getChannelData: (channel: number) => (channel === 0 ? left : right)
    } as unknown as AudioBuffer

    const peaks = computePeaks(buffer, 2)
    expect(peaks[0]).toBeCloseTo(0.5)
    expect(peaks[1]).toBeCloseTo(0.9)
  })
})
