import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CategoryItem, SampleListItem } from '../../../shared/ipc'
import type { FooterSampleDetail } from '../lib/playerShell'
import { sampleDurationTicks } from '../lib/playerShell'
import { bubbleStyle, categoryColor, formatDuration } from '../lib/sample-utils'

// Bubble geometry shared with the tracker: a sample bubble is 32px tall
// everywhere in the UI (hard rule), and browser rows keep the 6px gap the old
// flex-wrap layout used.
const TILE_HEIGHT_PX = 32
const TILE_GAP_PX = 6
const ROW_PITCH_PX = TILE_HEIGHT_PX + TILE_GAP_PX
const TILES_H_PADDING_PX = 10

interface TileRow {
  /** Index of the first tile in the row (inclusive). */
  start: number
  /** Index one past the last tile in the row (exclusive). */
  end: number
}

/**
 * Greedy row packing with the same result as CSS flex-wrap: tiles fill a row
 * left to right and wrap when the next tile (plus gap) would overflow. A tile
 * wider than the row gets a row of its own. Computed in JS so the browser list
 * can virtualize whole rows instead of mounting every sample as a DOM node.
 */
function packTileRows(widths: readonly number[], rowWidth: number, gap: number): TileRow[] {
  const rows: TileRow[] = []
  let start = 0
  let used = 0
  for (let i = 0; i < widths.length; i++) {
    const width = widths[i]
    const needed = used === 0 ? width : used + gap + width
    if (used > 0 && needed > rowWidth) {
      rows.push({ start, end: i })
      start = i
      used = width
    } else {
      used = needed
    }
  }
  if (start < widths.length) {
    rows.push({ start, end: widths.length })
  }
  return rows
}

interface SampleTileGridProps {
  samples: SampleListItem[]
  bpm: number
  pixelsPerTick: number
  selectedSamplePath: string | null
  flashSamplePath: string | null
  /** Colour override when a category filter is active — all visible samples share it. */
  activeCategoryColor: string | undefined
  categories: CategoryItem[]
  loading: boolean
  error: string | null
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onPreviewSample: (samplePath: string) => void
  onSampleDragStart: (event: React.DragEvent, detail: FooterSampleDetail) => void
}

/**
 * Virtualized sample browser grid. Samples are packed into fixed-height rows
 * (flex-wrap equivalent) and only the rows intersecting the viewport are
 * mounted, so libraries of thousands of files stay responsive (AGENTS.md hard
 * rule: never render the full dataset as real DOM nodes).
 */
export default function SampleTileGrid({
  samples,
  bpm,
  pixelsPerTick,
  selectedSamplePath,
  flashSamplePath,
  activeCategoryColor,
  categories,
  loading,
  error,
  onSelectSampleDetail,
  onPreviewSample,
  onSampleDragStart
}: SampleTileGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Tile width mirrors the tracker's bubble width for the same sample so the
  // bubble is pixel-identical in every view (hard rule).
  const tiles = useMemo(
    () =>
      samples.map((sample) => {
        const durationTicks = sampleDurationTicks(sample.durationSeconds, bpm)
        const width = Math.max(12, durationTicks * pixelsPerTick)
        const color =
          activeCategoryColor ??
          (sample.categoryId !== null
            ? (() => {
                const cat = categories.find((c) => c.id === sample.categoryId)
                return cat ? categoryColor(cat.name) : undefined
              })()
            : undefined)
        return { sample, width, color }
      }),
    [samples, bpm, pixelsPerTick, activeCategoryColor, categories]
  )

  // clientWidth includes padding; subtract it to get the packable row width.
  const rowWidth = Math.max(0, viewport.width - TILES_H_PADDING_PX * 2)
  const rows = useMemo(
    () => packTileRows(tiles.map((t) => t.width), rowWidth, TILE_GAP_PX),
    [tiles, rowWidth]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PITCH_PX,
    overscan: 6
  })

  // Fallback for an unmeasured viewport (first paint, jsdom): a zero-height
  // scroll rect would virtualize down to nothing, so render every row until
  // real measurements arrive.
  const virtualRows =
    viewport.height > 0
      ? virtualizer.getVirtualItems().map((item) => ({ index: item.index, start: item.start }))
      : rows.map((_, index) => ({ index, start: index * ROW_PITCH_PX }))

  return (
    <div className="tiles" ref={scrollRef}>
      <div className="tiles-virtual-canvas" style={{ height: rows.length * ROW_PITCH_PX }}>
        {virtualRows.map(({ index, start }) => {
          const row = rows[index]
          if (!row) return null
          return (
            <div
              key={index}
              className="tiles-row"
              style={{ transform: `translateY(${start}px)` }}
            >
              {tiles.slice(row.start, row.end).map(({ sample, width, color }) => {
                const isSelected = selectedSamplePath === sample.filepath
                return (
                  <button
                    key={sample.id}
                    type="button"
                    className={`sample-bubble${isSelected ? ' selected' : ''}${flashSamplePath === sample.filepath ? ' clip-flash' : ''}`}
                    style={{ width: `${width}px`, ...(color ? bubbleStyle(color) : {}) }}
                    title={`${sample.name} — click to preview, drag onto a lane`}
                    draggable
                    onDragStart={(e) =>
                      onSampleDragStart(e, {
                        name: sample.name,
                        filepath: sample.filepath,
                        tags: sample.tags,
                        duration: sample.durationSeconds,
                        color
                      })
                    }
                    onClick={() => {
                      onSelectSampleDetail({
                        name: sample.name,
                        filepath: sample.filepath,
                        tags: sample.tags,
                        duration: sample.durationSeconds
                      })
                      onPreviewSample(sample.filepath)
                    }}
                  >
                    <b>{sample.name.replace(/\.[^.]+$/, '')}</b>
                    <i>{formatDuration(sample.durationSeconds)}</i>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      {!loading && samples.length === 0 && (
        <p className="tiles-empty">
          {error ?? 'No samples found. Choose a Sample Folder and Re-scan.'}
        </p>
      )}
    </div>
  )
}
