import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SampleTileGrid from './SampleTileGrid'
import type { CategoryItem, SampleListItem } from '../../../shared/backend-api'

const CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Bass', parentId: null },
  { id: 2, name: 'Drums', parentId: null }
]

function makeSample(overrides: Partial<SampleListItem> = {}): SampleListItem {
  return {
    id: 'a.wav',
    dbId: 1,
    name: 'a.wav',
    relpath: 'a.wav',
    category: 'Bass',
    durationSeconds: 2.0,
    bpm: null,
    bpmSource: null,
    musicalKey: null,
    musicalKeySource: null,
    sampleType: null,
    sampleTypeSource: null,
    tags: [],
    categoryId: 1,
    tagIds: [],
    ...overrides
  }
}

describe('SampleTileGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders sample bubbles for provided samples', () => {
    const samples = [makeSample(), makeSample({ id: 'b.wav', relpath: 'b.wav', name: 'b.wav', dbId: 2 })]
    const { container } = render(
      <SampleTileGrid
        samples={samples}
        bubblePixelsPerSecond={120}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    const buttons = container.querySelectorAll('.sample-bubble')
    expect(buttons.length).toBe(2)
    expect((buttons[0] as HTMLElement).style.width).toBe('240px')
    expect((buttons[1] as HTMLElement).style.width).toBe('240px')
  })

  it('shows empty message when no samples and not loading', () => {
    const { container } = render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    expect(container.querySelector('.tiles-empty')?.textContent).toContain('No samples found')
  })

  it('shows error message when error is set', () => {
    const { container } = render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error="Custom error message"
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    expect(container.querySelector('.tiles-empty')?.textContent).toBe('Custom error message')
  })

  it('does not show empty message while loading', () => {
    const { container } = render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={true}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    expect(container.querySelector('.tiles-empty')).toBeNull()
  })

  it('fires onSampleContextMenu on right-click', () => {
    const onCtx = vi.fn()
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={onCtx}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    fireEvent.contextMenu(button)

    expect(onCtx).toHaveBeenCalledTimes(1)
    expect(onCtx.mock.calls[0]![0]).toBe(sample)
  })

  it('fires onSelectSampleDetail and onPreviewSample on click', () => {
    const onSelect = vi.fn()
    const onPreview = vi.fn()
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={onSelect}
        onPreviewSample={onPreview}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    fireEvent.click(button)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith('a.wav')
  })

  it('fires onSampleDragStart on drag start', () => {
    const onDrag = vi.fn()
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={onDrag}
        onSampleContextMenu={vi.fn()}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    fireEvent.dragStart(button)

    expect(onDrag).toHaveBeenCalledTimes(1)
  })

  it('adds selected class when sample path matches selectedSamplePath', () => {
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath="a.wav"
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    expect(button.classList.contains('selected')).toBe(true)
  })

  it('adds sample-bubble-flash class when flashSamplePath matches', () => {
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath="a.wav"
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    expect(button.classList.contains('sample-bubble-flash')).toBe(true)
  })

  it('applies activeCategorySlot to all sample bubbles', () => {
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={3}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    const button = container.querySelector('.sample-bubble') as HTMLElement
    // bubbleStyle points the surface at the shared slot custom property
    expect(button.style.backgroundColor).toBe('var(--palette-3)')
  })

  it('calls onLoadMore when hasMore is true and not loading', () => {
    vi.useFakeTimers()
    const onLoadMore = vi.fn()
    render(
      <SampleTileGrid
        samples={[makeSample()]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={true}
        onLoadMore={onLoadMore}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    // In jsdom with 0 viewport, the fallback renders all rows so lastVisibleRow >= rows.length - margin
    expect(onLoadMore).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not call onLoadMore when loading is true', () => {
    const onLoadMore = vi.fn()
    render(
      <SampleTileGrid
        samples={[makeSample()]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={true}
        error={null}
        hasMore={true}
        onLoadMore={onLoadMore}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('uses the category slot when no activeCategorySlot and sample has a category', () => {
    const sample = makeSample({ categoryId: 2 })
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        activeCategorySlot={undefined}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenu={vi.fn()}
      />
    )

    const button = container.querySelector('.sample-bubble') as HTMLElement
    // categorySlot('Drums') is slot 0, applied via bubbleStyle
    expect(button.style.backgroundColor).toBe('var(--palette-0)')
  })
})
