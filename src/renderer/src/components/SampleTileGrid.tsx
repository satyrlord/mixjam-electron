import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { CategoryItem, SampleListItem } from '../../../shared/backend-api'
import type { FooterSampleDetail } from '../lib/arrangement'
import {
  DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND,
  placementDurationTicks,
  sampleBubbleWidth,
  sampleBubbleWidthFromTicks
} from '../lib/arrangement'
import { bubbleStyle, categorySlot, formatDuration } from '../lib/sample-utils'
import { Tooltip } from './ui/Tooltip'
import { ContextMenuRoot, ContextMenuTrigger } from './ui/ContextMenu'

// The visible bubble stays 26px tall everywhere. The browser uses a denser 30px
// hit target for sample and category rows so they pack tightly.
const SAMPLE_BUBBLE_TARGET_PX = 30
const TILE_GAP_PX = 2
const ROW_PITCH_PX = SAMPLE_BUBBLE_TARGET_PX + TILE_GAP_PX
const TILES_H_PADDING_PX = 10

// Request the next windowed page when the scroll position is within this many
// rows of the end of the loaded prefix.
const LOAD_MORE_ROW_MARGIN = 6
const UNMEASURED_FALLBACK_ROW_LIMIT = 12

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
  active?: boolean
  samples: SampleListItem[]
  bubblePixelsPerSecond?: number
  pixelsPerTick?: number
  projectBpm?: number
  durationTicksBySamplePath?: ReadonlyMap<string, number>
  selectedSamplePath: string | null
  flashSamplePath: string | null
  /** Palette-slot override when a category filter is active — all visible samples share it. */
  activeCategorySlot: number | undefined
  categories: CategoryItem[]
  loading: boolean
  error: string | null
  /** True while more windowed pages exist beyond the loaded prefix. */
  hasMore: boolean
  onLoadMore: () => void
  onSelectSampleDetail: (detail: FooterSampleDetail) => void
  onPreviewSample: (samplePath: string, nativeBPM: number | null) => void
  onSampleDragStart: (event: React.DragEvent, detail: FooterSampleDetail) => void
  onSampleContextMenuOpen: (sample: SampleListItem, anchor: HTMLButtonElement) => void
  renderSampleContextMenu: (sample: SampleListItem) => ReactNode
}

/**
 * Virtualized sample browser grid. Samples are packed into fixed-height rows
 * (flex-wrap equivalent) and only the rows intersecting the viewport are
 * mounted, so libraries of thousands of files stay responsive (AGENTS.md hard
 * rule: never render the full dataset as real DOM nodes). Scrolling near the
 * end of the loaded prefix requests the next windowed page from the DB.
 * Memoized so the tracker's 10Hz playhead updates skip re-rendering the grid.
 */
function SampleTileGrid({
  active = true,
  samples,
  bubblePixelsPerSecond = DEFAULT_SAMPLE_BUBBLE_PIXELS_PER_SECOND,
  pixelsPerTick,
  projectBpm,
  durationTicksBySamplePath,
  selectedSamplePath,
  flashSamplePath,
  activeCategorySlot,
  categories,
  loading,
  error,
  hasMore,
  onLoadMore,
  onSelectSampleDetail,
  onPreviewSample,
  onSampleDragStart,
  onSampleContextMenuOpen,
  renderSampleContextMenu
}: SampleTileGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0, hidden: false })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setViewport({
      width: el.clientWidth,
      height: el.clientHeight,
      hidden: el.closest('[hidden]') !== null
    })
    measure()
    // Debounce ResizeObserver callbacks so rapid resize events (e.g. window
    // drag) do not trigger an expensive row-repack on every frame.
    let rafId = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(measure)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [active])

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  // Once a sample has been placed, its project-owned musical span is the width
  // source in every view. Before first placement, detected BPM supplies that
  // span; an unanalysed sample uses the current project BPM as its first-drop
  // reference.
  const tiles = useMemo(
    () =>
      samples.map((sample) => {
        const referenceBpm = sample.bpm !== null && Number.isFinite(sample.bpm) && sample.bpm > 0
          ? sample.bpm
          : projectBpm
        const durationTicks = durationTicksBySamplePath?.get(sample.relpath) ??
          (referenceBpm !== undefined
            ? placementDurationTicks(sample.durationSeconds, referenceBpm)
            : undefined)
        const width = durationTicks !== undefined && pixelsPerTick !== undefined
          ? sampleBubbleWidthFromTicks(durationTicks, pixelsPerTick)
          : sampleBubbleWidth(sample.durationSeconds, bubblePixelsPerSecond)
        const catName = sample.categoryId !== null ? categoryNames.get(sample.categoryId) : undefined
        const slot = activeCategorySlot ?? (catName ? categorySlot(catName) : undefined)
        return { sample, width, hitWidth: Math.max(width, SAMPLE_BUBBLE_TARGET_PX), slot }
      }),
    [samples, bubblePixelsPerSecond, pixelsPerTick, projectBpm, durationTicksBySamplePath, activeCategorySlot, categoryNames]
  )

  // clientWidth includes padding; subtract it to get the packable row width.
  const rowWidth = Math.max(0, viewport.width - TILES_H_PADDING_PX * 2)
  const rows = useMemo(
    () => packTileRows(tiles.map((t) => t.hitWidth), rowWidth, TILE_GAP_PX),
    [tiles, rowWidth]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PITCH_PX,
    overscan: 6
  })

  // Keep first paint useful without ever expanding a hidden or unmeasured
  // result set into the full DOM. Hidden tabs mount no rows; a visible viewport
  // gets a small bounded fallback until TanStack Virtual has real dimensions.
  const virtualRows =
    !active || viewport.hidden
      ? []
      : viewport.height > 0
      ? virtualizer.getVirtualItems().map((item) => ({ index: item.index, start: item.start }))
      : rows.slice(0, UNMEASURED_FALLBACK_ROW_LIMIT)
        .map((_, index) => ({ index, start: index * ROW_PITCH_PX }))

  // Windowed paging: pull the next page once the viewport nears the end of the
  // loaded rows.
  const lastVisibleRow = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : -1
  useEffect(() => {
    if (!active || !hasMore || loading || viewport.hidden || viewport.height <= 0 || virtualRows.length === 0) return
    if (rows.length === 0 || lastVisibleRow >= rows.length - LOAD_MORE_ROW_MARGIN) {
      onLoadMore()
    }
  }, [active, hasMore, loading, lastVisibleRow, rows.length, onLoadMore, viewport.hidden, viewport.height, virtualRows.length])

  return (
    <div className="tiles" ref={scrollRef} data-active={active ? 'true' : 'false'}>
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
              {tiles.slice(row.start, row.end).map(({ sample, width, hitWidth, slot }) => {
                const isSelected = selectedSamplePath === sample.relpath
                const tooltip = `${sample.name || 'Unknown'} — click to preview, drag onto a lane, right-click to tag`
                return (
                  <ContextMenuRoot key={sample.id}>
                    <Tooltip content={tooltip}>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          className="sample-bubble-hit-target"
                          style={{ width: `${hitWidth}px` }}
                          draggable
                          onPointerDown={(event) => onSampleContextMenuOpen(sample, event.currentTarget)}
                          onContextMenu={(event) => onSampleContextMenuOpen(sample, event.currentTarget)}
                          onDragStart={(e) =>
                            onSampleDragStart(e, {
                              name: sample.name,
                              relpath: sample.relpath,
                              tags: sample.tags,
                              bpm: sample.bpm,
                              duration: sample.durationSeconds,
                              slot
                            })
                          }
                          onClick={() => {
                            onSelectSampleDetail({
                              name: sample.name,
                              relpath: sample.relpath,
                              tags: sample.tags,
                              bpm: sample.bpm,
                              duration: sample.durationSeconds,
                              slot
                            })
                            onPreviewSample(sample.relpath, sample.bpm)
                          }}
                        >
                          <span
                            className={`sample-bubble${isSelected ? ' selected' : ''}${flashSamplePath === sample.relpath ? ' sample-bubble-flash' : ''}`}
                            style={{ width: `${width}px`, ...(slot !== undefined ? bubbleStyle(slot) : {}) } as React.CSSProperties}
                          >
                            <b>{(sample.name || 'Unknown').replace(/\.[^.]+$/, '')}</b>
                            <i>{formatDuration(sample.durationSeconds)}</i>
                          </span>
                        </button>
                      </ContextMenuTrigger>
                    </Tooltip>
                    {renderSampleContextMenu(sample)}
                  </ContextMenuRoot>
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

export default memo(SampleTileGrid)
