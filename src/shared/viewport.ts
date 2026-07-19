export const MINIMUM_VIEWPORT = Object.freeze({ width: 1920, height: 1080 })

export function supportsApplicationViewport(width: number, height: number): boolean {
  return width >= MINIMUM_VIEWPORT.width && height >= MINIMUM_VIEWPORT.height
}
