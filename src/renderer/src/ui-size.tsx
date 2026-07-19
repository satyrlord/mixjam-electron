import { createContext, useContext, type ReactNode } from 'react'

export const UI_SIZE_OPTIONS = [30, 40, 50] as const
export type UiSize = (typeof UI_SIZE_OPTIONS)[number]

// User-facing zoom labels. The internal size values (30/40/50) remain the
// geometry tokens; only the button text changes.
export const UI_SIZE_LABELS: Readonly<Record<UiSize, string>> = Object.freeze({
  30: '75%',
  40: '100%',
  50: '125%'
})

export interface UiGeometry {
  size: UiSize
  scale: number
  headerHeight: number
  footerHeight: number
  middleStripHeight: number
  middleMainHeight: number
  progressRowHeight: number
  tabRowHeight: number
  laneHeight: number
  bubbleHeight: number
  browserRowPitch: number
  browserHorizontalPadding: number
  mixerChannelWidth: number
  mixerFxWidth: number
  mixerFxHeight: number
  spaceXs: number
  spaceSm: number
  spaceMd: number
  spaceLg: number
  fontXs: number
  fontSm: number
  fontMd: number
  fontLg: number
}

export const UI_GEOMETRY: Readonly<Record<UiSize, UiGeometry>> = Object.freeze({
  30: Object.freeze({
    size: 30, scale: 1,
    headerHeight: 48, footerHeight: 48,
    middleStripHeight: 80, middleMainHeight: 48, progressRowHeight: 28, tabRowHeight: 44,
    laneHeight: 37, bubbleHeight: 24,
    browserRowPitch: 32, browserHorizontalPadding: 10,
    mixerChannelWidth: 76, mixerFxWidth: 160, mixerFxHeight: 112,
    spaceXs: 2, spaceSm: 4, spaceMd: 8, spaceLg: 12,
    fontXs: 10, fontSm: 11, fontMd: 12, fontLg: 14
  }),
  40: Object.freeze({
    size: 40, scale: 4 / 3,
    headerHeight: 64, footerHeight: 64,
    middleStripHeight: 107, middleMainHeight: 64, progressRowHeight: 37, tabRowHeight: 59,
    laneHeight: 49, bubbleHeight: 33,
    browserRowPitch: 43, browserHorizontalPadding: 13,
    mixerChannelWidth: 101, mixerFxWidth: 213, mixerFxHeight: 149,
    spaceXs: 3, spaceSm: 5, spaceMd: 11, spaceLg: 16,
    fontXs: 13, fontSm: 15, fontMd: 16, fontLg: 19
  }),
  50: Object.freeze({
    size: 50, scale: 5 / 3,
    headerHeight: 80, footerHeight: 80,
    middleStripHeight: 133, middleMainHeight: 80, progressRowHeight: 47, tabRowHeight: 73,
    laneHeight: 61, bubbleHeight: 41,
    browserRowPitch: 53, browserHorizontalPadding: 17,
    mixerChannelWidth: 127, mixerFxWidth: 267, mixerFxHeight: 187,
    spaceXs: 3, spaceSm: 7, spaceMd: 13, spaceLg: 20,
    fontXs: 17, fontSm: 18, fontMd: 20, fontLg: 23
  })
})

const UI_SIZE_STORAGE_KEY = 'mixjam:ui-size'

export function normalizeUiSize(value: unknown): UiSize {
  const numeric = Number(value)
  return numeric === 30 || numeric === 50 ? numeric : 40
}

export function loadUiSize(): UiSize {
  try {
    return normalizeUiSize(localStorage.getItem(UI_SIZE_STORAGE_KEY))
  } catch {
    return 40
  }
}

export function saveUiSize(size: UiSize): void {
  try {
    localStorage.setItem(UI_SIZE_STORAGE_KEY, String(size))
  } catch {
    // The selected in-memory size remains usable when storage is unavailable.
  }
}

const CSS_VARIABLES: Readonly<Record<keyof Omit<UiGeometry, 'size'>, string>> = Object.freeze({
  scale: '--ui-scale',
  headerHeight: '--ui-header-height',
  footerHeight: '--ui-footer-height',
  middleStripHeight: '--ui-middle-strip-height',
  middleMainHeight: '--ui-middle-main-height',
  progressRowHeight: '--ui-progress-row-height',
  tabRowHeight: '--ui-tab-row-height',
  laneHeight: '--ui-lane-height',
  bubbleHeight: '--ui-bubble-height',
  browserRowPitch: '--ui-browser-row-pitch',
  browserHorizontalPadding: '--ui-browser-horizontal-padding',
  mixerChannelWidth: '--ui-mixer-channel-width',
  mixerFxWidth: '--ui-mixer-fx-width',
  mixerFxHeight: '--ui-mixer-fx-height',
  spaceXs: '--ui-space-xs',
  spaceSm: '--ui-space-sm',
  spaceMd: '--ui-space-md',
  spaceLg: '--ui-space-lg',
  fontXs: '--ui-font-xs',
  fontSm: '--ui-font-sm',
  fontMd: '--ui-font-md',
  fontLg: '--ui-font-lg'
})

const UNIT_LESS = new Set<keyof Omit<UiGeometry, 'size'>>(['scale'])

export function applyUiSize(root: HTMLElement, size: UiSize): UiGeometry {
  const geometry = UI_GEOMETRY[size]
  root.dataset.uiSize = String(size)
  root.style.setProperty('--ui-size', `${size}px`)
  root.style.setProperty('--sample-bubble-height', `${geometry.bubbleHeight}px`)
  for (const [key, variable] of Object.entries(CSS_VARIABLES) as Array<[
    keyof Omit<UiGeometry, 'size'>,
    string
  ]>) {
    root.style.setProperty(variable, `${geometry[key]}${UNIT_LESS.has(key) ? '' : 'px'}`)
  }
  return geometry
}

const UiGeometryContext = createContext<UiGeometry>(UI_GEOMETRY[40])

export function UiSizeProvider({ size, children }: { size: UiSize; children: ReactNode }) {
  return <UiGeometryContext.Provider value={UI_GEOMETRY[size]}>{children}</UiGeometryContext.Provider>
}

export function useUiGeometry(): UiGeometry {
  return useContext(UiGeometryContext)
}
