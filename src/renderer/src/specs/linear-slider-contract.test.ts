import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENT_DIR = resolve(__dirname, '..', 'components')
const RENDERER_DIR = resolve(__dirname, '..')

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return productionSources(path)
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) return []
    return [path]
  })
}

describe('shared linear-slider source boundary', () => {
  it('keeps Radix assembly inside the project-owned LinearSlider', () => {
    const owners = [
      'BpmControl.tsx',
      'DelayModal.tsx',
      'PlayerView.tsx',
      'VerticalControls.tsx'
    ]

    for (const owner of owners) {
      const source = readFileSync(resolve(COMPONENT_DIR, owner), 'utf8')
      expect(source, owner).toContain('LinearSlider')
      expect(source, owner).not.toContain('@radix-ui/react-slider')
      expect(source, owner).not.toMatch(/Slider(?:Root|Track|Range|Thumb)/)
    }

    const sharedSource = readFileSync(resolve(COMPONENT_DIR, 'ui', 'Slider.tsx'), 'utf8')
    expect(sharedSource).toContain("from '@radix-ui/react-slider'")
    expect(sharedSource).toContain('linear-slider-handle')
  })

  it('rejects raw slider implementations everywhere else in renderer production code', () => {
    const sharedOwner = resolve(COMPONENT_DIR, 'ui', 'Slider.tsx')
    const violations = productionSources(RENDERER_DIR).flatMap((path) => {
      if (path === sharedOwner) return []
      const source = readFileSync(path, 'utf8')
      return source.includes('@radix-ui/react-slider') || /type=["']range["']/.test(source)
        ? [relative(RENDERER_DIR, path)]
        : []
    })

    expect(violations).toEqual([])
  })
})
