import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SampleTileGrid from './SampleTileGrid'
import type { CategoryItem, SampleListItem } from '../../../shared/backend-api'
import { UiSizeProvider } from '../ui-size'

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
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    const buttons = container.querySelectorAll('.sample-bubble')
    expect(buttons.length).toBe(2)
    expect((buttons[0] as HTMLElement).style.width).toBe('240px')
    expect((buttons[1] as HTMLElement).style.width).toBe('240px')
    expect(container.querySelectorAll('button.sample-bubble-hit-target')).toHaveLength(2)
    expect(buttons[0]?.closest('button')).toHaveClass('sample-bubble-hit-target')
  })

  it('uses the selected UI Size for virtual row pitch and minimum hit width', () => {
    const { container } = render(
      <UiSizeProvider size={50}>
        <SampleTileGrid
          samples={[makeSample({ durationSeconds: 0 })]}
          bubblePixelsPerSecond={1}
          selectedSamplePath={null}
          flashSamplePath={null}
          categories={CATEGORIES}
          loading={false}
          error={null}
          hasMore={false}
          onLoadMore={vi.fn()}
          onSelectSampleDetail={vi.fn()}
          onPreviewSample={vi.fn()}
          onSampleDragStart={vi.fn()}
          onSampleContextMenuOpen={vi.fn()}
          renderSampleContextMenu={() => null}
        />
      </UiSizeProvider>
    )

    expect((container.querySelector('.sample-bubble-hit-target') as HTMLElement).style.width).toBe('50px')
    expect((container.querySelector('.tiles-virtual-canvas') as HTMLElement).style.height).toBe('53px')
  })

  it('uses a placed sample musical span instead of remapping its width at the current BPM', () => {
    const { container, rerender } = render(
      <SampleTileGrid
        samples={[makeSample({ durationSeconds: 4, bpm: null })]}
        pixelsPerTick={2}
        projectBpm={120}
        durationTicksBySamplePath={new Map([['a.wav', 64]])}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect((container.querySelector('.sample-bubble') as HTMLElement).style.width).toBe('128px')

    rerender(
      <SampleTileGrid
        samples={[makeSample({ durationSeconds: 4, bpm: null })]}
        pixelsPerTick={2}
        projectBpm={60}
        durationTicksBySamplePath={new Map([['a.wav', 64]])}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect((container.querySelector('.sample-bubble') as HTMLElement).style.width).toBe('128px')
  })

  it('shows empty message when no samples and not loading', () => {
    const { container } = render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect(container.querySelector('.tiles-empty')).toHaveTextContent('No samples yet')
    expect(container.querySelector('.tiles-empty')).toHaveTextContent(
      'This Sample Folder has no supported audio files.'
    )
  })

  it('shows error message when error is set', () => {
    render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error="Custom error message"
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Samples could not load')
    expect(screen.getByRole('alert')).toHaveTextContent('Custom error message')
  })

  it('shows a labelled skeleton state while loading', () => {
    const { container } = render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={true}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect(container.querySelector('.tiles-empty')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading samples')
    expect(container.querySelectorAll('.tiles-skeleton span')).toHaveLength(4)
    expect(container.querySelector('.tiles')).toHaveAttribute('aria-busy', 'true')
  })

  it('offers a quiet recovery action for a filtered empty result', () => {
    const onClearFilters = vi.fn()
    render(
      <SampleTileGrid
        samples={[]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        emptyTitle="No matching samples"
        emptyDescription="Try a different search, category, or tag."
        onClearFilters={onClearFilters}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('No matching samples')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClearFilters).toHaveBeenCalledOnce()
  })

  it('fires onSampleContextMenu on right-click', () => {
    const onCtx = vi.fn()
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={onCtx}
        renderSampleContextMenu={() => null}
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
    const sample = makeSample({ bpm: 96 })
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={onSelect}
        onPreviewSample={onPreview}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    fireEvent.click(button)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith('a.wav', 96)
  })

  it('fires onSampleDragStart on drag start', () => {
    const onDrag = vi.fn()
    const sample = makeSample()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={onDrag}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
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
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
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
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    const button = container.querySelector('.sample-bubble')!
    expect(button.classList.contains('sample-bubble-flash')).toBe(true)
  })

  it('keeps the sample category slot stable in the bubble and drag payload', () => {
    const sample = makeSample({ categoryId: 2 })
    const onSampleDragStart = vi.fn()
    const { container } = render(
      <SampleTileGrid
        samples={[sample]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={false}
        onLoadMore={vi.fn()}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={onSampleDragStart}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    const bubble = container.querySelector('.sample-bubble') as HTMLElement
    expect(bubble.style.backgroundColor).toBe('var(--palette-0)')

    fireEvent.dragStart(bubble)
    expect(onSampleDragStart).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slot: 0 })
    )
  })

  it('does not call onLoadMore before the viewport is measured', () => {
    vi.useFakeTimers()
    const onLoadMore = vi.fn()
    render(
      <SampleTileGrid
        samples={[makeSample()]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={false}
        error={null}
        hasMore={true}
        onLoadMore={onLoadMore}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect(onLoadMore).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not mount sample rows or request another page while inactive', () => {
    const onLoadMore = vi.fn()
    const samples = Array.from({ length: 20 }, (_, index) => makeSample({
      id: `${index}.wav`,
      dbId: index,
      name: `${index}.wav`,
      relpath: `${index}.wav`
    }))

    const { container } = render(
      <div hidden>
        <SampleTileGrid
          active={false}
          samples={samples}
          selectedSamplePath={null}
          flashSamplePath={null}
          categories={CATEGORIES}
          loading={false}
          error={null}
          hasMore
          onLoadMore={onLoadMore}
          onSelectSampleDetail={vi.fn()}
          onPreviewSample={vi.fn()}
          onSampleDragStart={vi.fn()}
          onSampleContextMenuOpen={vi.fn()}
          renderSampleContextMenu={() => null}
        />
      </div>
    )

    expect(container.querySelectorAll('.sample-bubble')).toHaveLength(0)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('does not call onLoadMore when loading is true', () => {
    const onLoadMore = vi.fn()
    render(
      <SampleTileGrid
        samples={[makeSample()]}
        selectedSamplePath={null}
        flashSamplePath={null}
        categories={CATEGORIES}
        loading={true}
        error={null}
        hasMore={true}
        onLoadMore={onLoadMore}
        onSelectSampleDetail={vi.fn()}
        onPreviewSample={vi.fn()}
        onSampleDragStart={vi.fn()}
        onSampleContextMenuOpen={vi.fn()}
        renderSampleContextMenu={() => null}
      />
    )

    expect(onLoadMore).not.toHaveBeenCalled()
  })

})
