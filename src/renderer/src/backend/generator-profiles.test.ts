import { describe, expect, it } from 'vitest'
import {
  MIXJAM_GENERATOR_DEFAULT_PROFILE_ID,
  MIXJAM_GENERATOR_PROFILE_IDS,
  MIXJAM_GENERATOR_PROFILE_LABELS,
  MIXJAM_GENERATOR_PROFILE_VERSIONS
} from '../../../shared/generator-templates'
import templateSchema from '../../../shared/generator-templates/schema.json'
import {
  GENERATOR_PROFILES,
  createGeneratorProfileRegistry,
  parseGeneratorTemplate
} from './generator-profiles'

interface MutableEffect {
  values: Record<string, unknown>
  [key: string]: unknown
}

interface MutableLane {
  types: unknown[]
  effects: MutableEffect[]
  transitionKind?: unknown
  [key: string]: unknown
}

interface MutableSection {
  activeLanes: number[]
  weight: number
  [key: string]: unknown
}

interface MutableTemplate {
  id: string
  label: string
  default: boolean
  order: number
  lanes: MutableLane[]
  sections: MutableSection[]
  [key: string]: unknown
}

function mutableTemplate(id = 'custom-profile'): MutableTemplate {
  const template = JSON.parse(JSON.stringify(GENERATOR_PROFILES.techno)) as MutableTemplate
  template.id = id
  template.label = 'Custom profile'
  template.default = false
  template.order = 100
  return template
}

describe('bundled generator templates', () => {
  it('auto-discovers and keeps the three migrated baselines registered', () => {
    expect(MIXJAM_GENERATOR_PROFILE_IDS).toEqual(expect.arrayContaining(['techno', 'trance', 'house']))
    expect(Object.keys(GENERATOR_PROFILES).sort()).toEqual([...MIXJAM_GENERATOR_PROFILE_IDS].sort())
    expect(MIXJAM_GENERATOR_PROFILE_LABELS.techno).toBe('Techno')
    expect(MIXJAM_GENERATOR_PROFILE_LABELS.trance).toBe('Trance')
    expect(MIXJAM_GENERATOR_PROFILE_LABELS.house).toBe('House')
    expect(MIXJAM_GENERATOR_PROFILE_VERSIONS.techno).toBe(2)
    expect(MIXJAM_GENERATOR_PROFILE_VERSIONS.trance).toBe(2)
    expect(MIXJAM_GENERATOR_PROFILE_VERSIONS.house).toBe(2)
    expect(MIXJAM_GENERATOR_DEFAULT_PROFILE_ID).toBe('techno')
  })

  it('preserves the shipped profile-specific data after the JSON migration', () => {
    expect(GENERATOR_PROFILES.techno).toMatchObject({
      bpmTolerance: 8,
      coreLanes: [0, 4, 6],
      sections: [
        { name: 'Intro', weight: 8, phraseMode: 'sparse' },
        { name: 'Groove', weight: 22, phraseMode: 'steady' },
        { name: 'Build', weight: 15, phraseMode: 'build' },
        { name: 'Breakdown', weight: 10, phraseMode: 'breakdown' },
        { name: 'Drive', weight: 23, phraseMode: 'return' },
        { name: 'Peak', weight: 14, phraseMode: 'peak' },
        { name: 'Outro', weight: 8, phraseMode: 'outro' }
      ]
    })
    expect(GENERATOR_PROFILES.trance.lanes[0]!.effects.map((effect) => effect.presetName)).toEqual(['Classic Control'])
    expect(GENERATOR_PROFILES.trance.lanes[6]!.effects.map((effect) => effect.presetName)).toEqual(['Ping-Pong Eighths', 'Long Hall'])
    expect(GENERATOR_PROFILES.house.lanes[5]!.effects.map((effect) => effect.presetName)).toEqual(['Gentle Glue'])
    expect(GENERATOR_PROFILES.house.lanes[6]!.effects.map((effect) => effect.presetName)).toEqual(['Slapback'])
    expect(GENERATOR_PROFILES.house.lanes[12]!.effects.map((effect) => effect.presetName)).toEqual(['Gentle Glue'])
  })

  it('ships an editor schema aligned with the runtime schema version and lane count', () => {
    expect(templateSchema.properties.schemaVersion.const).toBe(1)
    expect(templateSchema.properties.lanes.minItems).toBe(16)
    expect(templateSchema.properties.lanes.maxItems).toBe(16)
  })
})

describe('parseGeneratorTemplate', () => {
  it('accepts a complete genre-neutral template', () => {
    const parsed = parseGeneratorTemplate(mutableTemplate(), 'custom-profile.json')
    expect(parsed).toMatchObject({ id: 'custom-profile', label: 'Custom profile', version: 2 })
    expect(parsed.lanes).toHaveLength(16)
  })

  it.each([
    ['unknown field', (value: MutableTemplate) => { value.lnaes = value.lanes }, 'template.lnaes'],
    ['unsupported type', (value: MutableTemplate) => { value.lanes[0]!.types = ['Banjo'] }, 'template.lanes[0].types[0]'],
    ['wrong lane count', (value: MutableTemplate) => { value.lanes.pop() }, 'template.lanes'],
    ['duplicate active lane', (value: MutableTemplate) => { value.sections[0]!.activeLanes.push(value.sections[0]!.activeLanes[0]!) }, 'template.sections[0].activeLanes'],
    ['invalid section total', (value: MutableTemplate) => { value.sections[0]!.weight = 9 }, 'template.sections'],
    ['invalid effect value', (value: MutableTemplate) => { value.lanes[0]!.effects[0]!.values.ratio = 21 }, 'template.lanes[0].effects[0].values.ratio'],
    ['missing transition kind', (value: MutableTemplate) => { delete value.lanes[14]!.transitionKind }, 'template.lanes[14].transitionKind'],
    ['unsupported schema version', (value: MutableTemplate) => { value.schemaVersion = 2 }, 'template.schemaVersion'],
    ['unsupported stereo pairing', (value: MutableTemplate) => { value.stereoPairRules = [] }, 'template.stereoPairRules'],
    ['duplicate lane name', (value: MutableTemplate) => { value.lanes[1]!.name = value.lanes[0]!.name }, 'template.lanes'],
    ['duplicate section name', (value: MutableTemplate) => { value.sections[1]!.name = value.sections[0]!.name }, 'template.sections']
  ])('rejects %s with a field-specific error', (_name, mutate, field) => {
    const value = mutableTemplate()
    mutate(value)
    expect(() => parseGeneratorTemplate(value, 'custom-profile.json')).toThrow(field)
  })
})

describe('createGeneratorProfileRegistry', () => {
  it('registers a new JSON-only profile and derives its public catalog', () => {
    const registry = createGeneratorProfileRegistry({
      './generator-templates/templates/custom-profile.json': mutableTemplate()
    })
    expect(registry.ids).toEqual(['custom-profile'])
    expect(registry.labels).toEqual({ 'custom-profile': 'Custom profile' })
    expect(registry.versions).toEqual({ 'custom-profile': 2 })
    expect(Object.isFrozen(registry.profiles['custom-profile'])).toBe(true)
  })

  it('requires the template ID to match its filename', () => {
    expect(() => createGeneratorProfileRegistry({
      './generator-templates/templates/different-name.json': mutableTemplate()
    })).toThrow('template.id: must match the JSON filename')
  })

  it('rejects duplicate IDs and multiple defaults before planning', () => {
    const first = mutableTemplate('same')
    const second = mutableTemplate('same')
    expect(() => createGeneratorProfileRegistry({
      './one/same.json': first,
      './two/same.json': second
    })).toThrow('Duplicate generator template id: same')

    const alpha = mutableTemplate('alpha')
    const beta = mutableTemplate('beta')
    alpha.default = true
    beta.default = true
    expect(() => createGeneratorProfileRegistry({
      './templates/alpha.json': alpha,
      './templates/beta.json': beta
    })).toThrow('Only one bundled generator template may be the default.')
  })

  it('sorts by order, label, and ID and falls back to the first profile by that order', () => {
    const alpha = mutableTemplate('alpha')
    const beta = mutableTemplate('beta')
    const gamma = mutableTemplate('gamma')
    alpha.order = 5
    beta.order = 5
    gamma.order = 5
    alpha.label = 'Zulu'
    beta.label = 'Alpha'
    gamma.label = 'Alpha'

    const registry = createGeneratorProfileRegistry({
      'gamma.json': gamma,
      'alpha.json': alpha,
      'beta.json': beta
    })

    expect(registry.ids).toEqual(['beta', 'gamma', 'alpha'])
    expect(registry.defaultProfileId).toBe('beta')
  })

  it('validates and exposes 250 JSON-only profiles without a generated ID list', () => {
    const sources = Object.fromEntries(Array.from({ length: 250 }, (_, index) => {
      const id = `genre-${index}`
      const template = mutableTemplate(id)
      template.label = `Genre ${index.toString().padStart(3, '0')}`
      template.order = 249 - index
      return [`./templates/${id}.json`, template]
    }))

    const registry = createGeneratorProfileRegistry(sources)

    expect(registry.ids).toHaveLength(250)
    expect(Object.keys(registry.profiles)).toHaveLength(250)
    expect(registry.ids[0]).toBe('genre-249')
    expect(registry.ids.at(-1)).toBe('genre-0')
  })
})
