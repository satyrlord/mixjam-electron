import { describe, expect, it } from 'vitest'
import { applyUiSize, normalizeUiSize, UI_GEOMETRY, UI_SIZE_OPTIONS } from './ui-size'

describe('UI Size geometry', () => {
  it('owns the complete 30, 40, and 50 preset table', () => {
    expect(UI_SIZE_OPTIONS).toEqual([30, 40, 50])
    expect(UI_GEOMETRY[30]).toMatchObject({
      size: 30, headerHeight: 48, middleStripHeight: 80,
      laneHeight: 37, bubbleHeight: 24, browserRowPitch: 32,
      mixerChannelWidth: 76, mixerReturnWidth: 120, mixerFxWidth: 160
    })
    expect(UI_GEOMETRY[40]).toMatchObject({
      size: 40, headerHeight: 64, middleStripHeight: 107,
      laneHeight: 49, bubbleHeight: 33, browserRowPitch: 43,
      mixerChannelWidth: 101, mixerReturnWidth: 160, mixerFxWidth: 213
    })
    expect(UI_GEOMETRY[50]).toMatchObject({
      size: 50, headerHeight: 80, middleStripHeight: 133,
      laneHeight: 61, bubbleHeight: 41, browserRowPitch: 53,
      mixerChannelWidth: 127, mixerReturnWidth: 200, mixerFxWidth: 267
    })
  })

  it('normalizes unsupported values to the 40 default', () => {
    expect(normalizeUiSize(30)).toBe(30)
    expect(normalizeUiSize('40')).toBe(40)
    expect(normalizeUiSize(50)).toBe(50)
    expect(normalizeUiSize(44)).toBe(40)
    expect(normalizeUiSize(null)).toBe(40)
  })

  it('publishes one root token set for app content and portals', () => {
    const root = document.createElement('html')

    applyUiSize(root, 50)

    expect(root.dataset.uiSize).toBe('50')
    expect(root.style.getPropertyValue('--ui-size')).toBe('50px')
    expect(root.style.getPropertyValue('--ui-header-height')).toBe('80px')
    expect(root.style.getPropertyValue('--ui-middle-strip-height')).toBe('133px')
    expect(root.style.getPropertyValue('--ui-browser-row-pitch')).toBe('53px')
    expect(root.style.getPropertyValue('--ui-font-md')).toBe('20px')
    expect(root.style.getPropertyValue('--sample-bubble-height')).toBe('41px')
  })
})
