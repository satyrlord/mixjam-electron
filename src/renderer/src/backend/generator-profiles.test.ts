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

interface MutableLane {
  types: unknown[]
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
  it('auto-discovers the six shipped templates in product order', () => {
    expect(MIXJAM_GENERATOR_PROFILE_IDS).toEqual([
      'techno',
      'trance',
      'house',
      'tropical-house',
      'ambient-house',
      'melodic-techno'
    ])
    expect(Object.keys(GENERATOR_PROFILES).sort()).toEqual([...MIXJAM_GENERATOR_PROFILE_IDS].sort())
    expect(MIXJAM_GENERATOR_PROFILE_LABELS).toEqual({
      techno: 'Techno',
      trance: 'Trance',
      house: 'House',
      'tropical-house': 'Tropical House',
      'ambient-house': 'Ambient House',
      'melodic-techno': 'Melodic Techno'
    })
    expect(MIXJAM_GENERATOR_PROFILE_VERSIONS).toEqual({
      techno: 5,
      trance: 5,
      house: 5,
      'tropical-house': 2,
      'ambient-house': 2,
      'melodic-techno': 2
    })
    expect(MIXJAM_GENERATOR_DEFAULT_PROFILE_ID).toBe('techno')
  })

  it('keeps the researched baseline arcs distinct', () => {
    expect(GENERATOR_PROFILES.techno).toMatchObject({
      bpmTolerance: 8,
      coreLanes: [0, 4, 6],
      sections: [
        expect.objectContaining({ name: 'Intro', weight: 8, phraseMode: 'build' }),
        expect.objectContaining({ name: 'Groove', weight: 22, phraseMode: 'steady' }),
        expect.objectContaining({ name: 'Build', weight: 12, phraseMode: 'build' }),
        expect.objectContaining({ name: 'Breakdown', weight: 12, phraseMode: 'breakdown' }),
        expect.objectContaining({ name: 'Drive', weight: 24, phraseMode: 'return' }),
        expect.objectContaining({ name: 'Peak', weight: 14, phraseMode: 'peak' }),
        expect.objectContaining({ name: 'Outro', weight: 8, phraseMode: 'outro' })
      ]
    })
    expect(GENERATOR_PROFILES.trance).toMatchObject({
      bpmTolerance: 6,
      coreLanes: [0, 4, 5, 6],
      sections: expect.arrayContaining([
        expect.objectContaining({ name: 'Breakdown', weight: 12, phraseMode: 'breakdown' }),
        expect.objectContaining({ name: 'Rebuild', weight: 8, phraseMode: 'build' }),
        expect.objectContaining({ name: 'Main Theme', weight: 24, phraseMode: 'return' })
      ])
    })
    expect(GENERATOR_PROFILES.house).toMatchObject({
      bpmTolerance: 8,
      coreLanes: [0, 2, 4],
      sections: expect.arrayContaining([
        expect.objectContaining({ name: 'Vocal Entry', weight: 12, phraseMode: 'steady' }),
        expect.objectContaining({ name: 'Main Groove', weight: 16, phraseMode: 'return' }),
        expect.objectContaining({ name: 'Rebuild', weight: 8, phraseMode: 'build' })
      ])
    })
  })

  it('keeps every template dense enough for the 80/80/80 rule with a Pareto quiet share', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      const profile = GENERATOR_PROFILES[id]!
      // Operationally quiet time (breakdown rest cadence and outro ramp) stays
      // near the Pareto 20%.
      const quiet = profile.sections
        .filter((section) => section.phraseMode === 'breakdown' || section.phraseMode === 'outro')
        .reduce((sum, section) => sum + section.weight, 0)
      expect(quiet).toBeGreaterThanOrEqual(15)
      expect(quiet).toBeLessThanOrEqual(25)
      // At least 80% of non-transition lanes can be scheduled for 85% of bars.
      const nonTransition = profile.lanes.flatMap((lane, index) => lane.role === 'transition' ? [] : [index])
      const covered = nonTransition.filter((laneIndex) =>
        profile.sections.reduce((sum, section) =>
          sum + (section.activeLanes.includes(laneIndex) ? section.weight : 0), 0) >= 85
      )
      expect(covered.length).toBeGreaterThanOrEqual(Math.ceil(0.8 * nonTransition.length))
    }
  })

  it('encodes distinct tropical-house, ambient-house, and melodic-techno plans', () => {
    expect(GENERATOR_PROFILES['tropical-house']).toMatchObject({
      bpmTolerance: 5,
      coreLanes: [0, 4, 6],
      sections: expect.arrayContaining([
        expect.objectContaining({ name: 'Beach Intro', weight: 8, phraseMode: 'build' }),
        expect.objectContaining({ name: 'Countermelody Peak', weight: 16, phraseMode: 'peak' })
      ])
    })
    expect(GENERATOR_PROFILES['tropical-house'].lanes[2]).toMatchObject({
      name: 'Swung Hi-hat', beatPattern: [5, 13, 21, 29], gain: 0.32
    })

    expect(GENERATOR_PROFILES['ambient-house']).toMatchObject({
      bpmTolerance: 10,
      coreLanes: [0, 6, 9],
      sections: expect.arrayContaining([
        expect.objectContaining({ name: 'Atmosphere Intro', weight: 10, phraseMode: 'sparse' }),
        expect.objectContaining({ name: 'Dissolve', weight: 12, phraseMode: 'breakdown' })
      ])
    })
    expect(GENERATOR_PROFILES['ambient-house'].lanes[1]).toMatchObject({
      name: 'Sparse Clap', beatPattern: [24], beatMutation: [8, 24], gain: 0.24
    })

    expect(GENERATOR_PROFILES['melodic-techno']).toMatchObject({
      bpmTolerance: 6,
      coreLanes: [0, 4, 5, 6],
      sections: expect.arrayContaining([
        expect.objectContaining({ name: 'Motif Reveal', weight: 14, phraseMode: 'steady' }),
        expect.objectContaining({ name: 'Atmospheric Break', weight: 12, phraseMode: 'breakdown' }),
        expect.objectContaining({ name: 'Melodic Peak', weight: 14, phraseMode: 'peak' })
      ])
    })
    expect(GENERATOR_PROFILES['melodic-techno'].lanes[3]).toMatchObject({
      name: 'Shaker / Rim', beatPattern: [6, 10, 20, 24, 28]
    })
  })

  it('keeps template pan centered until planner stereo evidence is available', () => {
    expect(MIXJAM_GENERATOR_PROFILE_IDS.every((id) =>
      GENERATOR_PROFILES[id]!.lanes.every((lane) => lane.pan === 0)
    )).toBe(true)
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
    expect(parsed).toMatchObject({ id: 'custom-profile', label: 'Custom profile', version: 5 })
    expect(parsed.lanes).toHaveLength(16)
  })

  it.each([
    ['unknown field', (value: MutableTemplate) => { value.lnaes = value.lanes }, 'template.lnaes'],
    ['unsupported type', (value: MutableTemplate) => { value.lanes[0]!.types = ['Banjo'] }, 'template.lanes[0].types[0]'],
    ['wrong lane count', (value: MutableTemplate) => { value.lanes.pop() }, 'template.lanes'],
    ['duplicate active lane', (value: MutableTemplate) => { value.sections[0]!.activeLanes.push(value.sections[0]!.activeLanes[0]!) }, 'template.sections[0].activeLanes'],
    ['invalid section total', (value: MutableTemplate) => { value.sections[0]!.weight = 9 }, 'template.sections'],
    ['obsolete effect field', (value: MutableTemplate) => { value.lanes[0]!.effects = [] }, 'template.lanes[0].effects'],
    ['missing transition kind', (value: MutableTemplate) => { delete value.lanes[14]!.transitionKind }, 'template.lanes[14].transitionKind'],
    ['unsupported schema version', (value: MutableTemplate) => { value.schemaVersion = 2 }, 'template.schemaVersion'],
    ['unsupported stereo pairing', (value: MutableTemplate) => { value.stereoPairRules = [] }, 'template.stereoPairRules'],
    ['duplicate lane name', (value: MutableTemplate) => { value.lanes[1]!.name = value.lanes[0]!.name }, 'template.lanes'],
    ['duplicate section name', (value: MutableTemplate) => { value.sections[1]!.name = value.sections[0]!.name }, 'template.sections'],
    ['starved lane coverage', (value: MutableTemplate) => {
      for (const section of value.sections) {
        section.activeLanes = section.activeLanes.filter((lane) => lane !== 1)
      }
      value.sections[0]!.activeLanes.push(1)
    }, 'template.sections']
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
    expect(registry.versions).toEqual({ 'custom-profile': 5 })
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
