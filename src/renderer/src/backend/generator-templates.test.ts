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
  MAX_TEMPLATE_PAN,
  createGeneratorProfileRegistry,
  parseGeneratorTemplate
} from '../../../shared/generator-templates'

interface MutableLane {
  types: unknown[]
  transitionKind?: unknown
  [key: string]: unknown
}

interface MutableSection {
  activeLanes: number[]
  weight: number
  name: string
  [key: string]: unknown
}

interface MutableArc {
  name: string
  sections: MutableSection[]
  ops?: Array<Record<string, unknown>>
}

interface MutableTemplate {
  id: string
  label: string
  default: boolean
  order: number
  lanes: MutableLane[]
  arcs: MutableArc[]
  returns: unknown[]
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
    expect(MIXJAM_GENERATOR_PROFILE_VERSIONS.techno).toBeGreaterThanOrEqual(6)
    expect(MIXJAM_GENERATOR_DEFAULT_PROFILE_ID).toBe('techno')
  })

  it('carries two or three seeded arcs per profile, each an authored variation', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      const profile = GENERATOR_PROFILES[id]!
      expect(profile.arcs.length).toBeGreaterThanOrEqual(2)
      expect(profile.arcs.length).toBeLessThanOrEqual(3)
      const names = profile.arcs.map((arc) => arc.name)
      expect(new Set(names).size).toBe(names.length)
      for (const arc of profile.arcs) {
        expect(arc.sections.reduce((sum, section) => sum + section.weight, 0)).toBe(100)
      }
    }
  })

  it('leaves every arc with quiet time and no lane running the whole song', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      const profile = GENERATOR_PROFILES[id]!
      for (const arc of profile.arcs) {
        const busiest = Math.max(...arc.sections.map((section) => section.activeLanes.length))
        const quietest = Math.min(...arc.sections.map((section) => section.activeLanes.length))
        // A section set that never drops below half the busiest section is the
        // wall of sound the deleted 80/80/80 density rule manufactured.
        expect(quietest).toBeLessThanOrEqual(busiest / 2)
        // No lane may be scheduled in every section: zero lanes above 90%
        // occupancy is the envelope's hardest measure to hit by accident.
        for (let laneIndex = 0; laneIndex < profile.lanes.length; laneIndex++) {
          const share = arc.sections.reduce((sum, section) =>
            sum + (section.activeLanes.includes(laneIndex) ? section.weight : 0), 0)
          expect(share).toBeLessThanOrEqual(92)
        }
      }
    }
  })

  it('declares exactly one reverb and one delay return per profile', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      const profile = GENERATOR_PROFILES[id]!
      expect(profile.returns.map((bus) => bus.module)).toEqual(['aetherform-reverb', 'echoform-delay'])
      expect(profile.returns.every((bus) => bus.returnLevel > 0)).toBe(true)
      expect(profile.lanes.every((lane) => lane.sends.length === profile.returns.length)).toBe(true)
      // The reference library puts at least 70% of lanes into a return.
      const sending = profile.lanes.filter((lane) => lane.sends.some((send) => send > 0))
      expect(sending.length / profile.lanes.length).toBeGreaterThanOrEqual(0.7)
    }
  })

  it('caps template lane position at the non-pair mix limit and keeps the image wide', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      const profile = GENERATOR_PROFILES[id]!
      expect(profile.lanes.every((lane) => Math.abs(lane.pan) <= MAX_TEMPLATE_PAN)).toBe(true)
      expect(new Set(profile.lanes.map((lane) => lane.pan)).size).toBeGreaterThanOrEqual(6)
    }
  })

  it('keeps the kick at the top of the reference gain hierarchy', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      const profile = GENERATOR_PROFILES[id]!
      const kick = profile.lanes.find((lane) => lane.types[0] === 'Kick')!
      // The ambient profile ties its soft pulse with its dub bass, which is what
      // the AmbientHouse reference does; nothing may sit above the kick.
      expect(kick.gain).toBe(Math.max(...profile.lanes.map((lane) => lane.gain)))
      // Support material lives well below it — hats and pads at roughly half.
      const textural = profile.lanes.filter((lane) => lane.role === 'atmosphere')
      expect(Math.max(...textural.map((lane) => lane.gain))).toBeLessThan(kick.gain)
    }
  })

  it('addresses every boundary op at a section its own arc declares', () => {
    for (const id of MIXJAM_GENERATOR_PROFILE_IDS) {
      for (const arc of GENERATOR_PROFILES[id]!.arcs) {
        const names = new Set(arc.sections.map((section) => section.name))
        for (const op of arc.ops) {
          for (const reference of [op.at, op.from, op.to]) {
            if (reference !== undefined) expect(names.has(reference)).toBe(true)
          }
        }
      }
    }
  })

  it('ships an editor schema aligned with the runtime schema version and lane count', () => {
    expect(templateSchema.properties.schemaVersion.const).toBe(2)
    expect(templateSchema.properties.lanes.minItems).toBe(16)
    expect(templateSchema.properties.lanes.maxItems).toBe(16)
  })
})

describe('parseGeneratorTemplate', () => {
  it('accepts a complete genre-neutral template', () => {
    const parsed = parseGeneratorTemplate(mutableTemplate(), 'custom-profile.json')
    expect(parsed).toMatchObject({ id: 'custom-profile', label: 'Custom profile' })
    expect(parsed.lanes).toHaveLength(16)
    expect(parsed.arcs.length).toBeGreaterThanOrEqual(2)
  })

  it.each([
    ['unknown field', (value: MutableTemplate) => { value.lnaes = value.lanes }, 'template.lnaes'],
    ['unsupported type', (value: MutableTemplate) => { value.lanes[0]!.types = ['Banjo'] }, 'template.lanes[0].types[0]'],
    ['wrong lane count', (value: MutableTemplate) => { value.lanes.pop() }, 'template.lanes'],
    ['duplicate active lane', (value: MutableTemplate) => {
      value.arcs[0]!.sections[0]!.activeLanes.push(value.arcs[0]!.sections[0]!.activeLanes[0]!)
    }, 'template.arcs[0].sections[0].activeLanes'],
    ['invalid section total', (value: MutableTemplate) => { value.arcs[0]!.sections[0]!.weight = 9 }, 'template.arcs[0].sections'],
    ['obsolete effect field', (value: MutableTemplate) => { value.lanes[0]!.effects = [] }, 'template.lanes[0].effects'],
    ['obsolete top-level sections', (value: MutableTemplate) => { value.sections = value.arcs[0]!.sections }, 'template.sections'],
    ['missing transition kind', (value: MutableTemplate) => { delete value.lanes[14]!.transitionKind }, 'template.lanes[14].transitionKind'],
    ['unsupported schema version', (value: MutableTemplate) => { value.schemaVersion = 1 }, 'template.schemaVersion'],
    ['unsupported stereo pairing', (value: MutableTemplate) => { value.stereoPairRules = [] }, 'template.stereoPairRules'],
    ['duplicate lane name', (value: MutableTemplate) => { value.lanes[1]!.name = value.lanes[0]!.name }, 'template.lanes'],
    ['duplicate section name', (value: MutableTemplate) => {
      value.arcs[0]!.sections[1]!.name = value.arcs[0]!.sections[0]!.name
    }, 'template.arcs[0].sections'],
    ['duplicate arc name', (value: MutableTemplate) => { value.arcs[1]!.name = value.arcs[0]!.name }, 'template.arcs'],
    ['a lane no section ever activates', (value: MutableTemplate) => {
      for (const section of value.arcs[0]!.sections) {
        section.activeLanes = section.activeLanes.filter((lane) => lane !== 1)
      }
    }, 'template.arcs[0].sections'],
    ['a third return bus', (value: MutableTemplate) => {
      value.returns.push({ module: 'aetherform-reverb', preset: 'Dark Hall', returnLevel: 0.2 })
    }, 'template.returns'],
    ['a send vector that does not match the bus count', (value: MutableTemplate) => { value.lanes[0]!.sends = [0] }, 'template.lanes[0].sends'],
    ['a lane panned past the mix-position cap', (value: MutableTemplate) => { value.lanes[0]!.pan = 0.8 }, 'template.lanes[0].pan'],
    ['an op naming a section the arc does not declare', (value: MutableTemplate) => {
      value.arcs[0]!.ops = [{ op: 'swap', lane: 5, at: 'Nowhere' }]
    }, 'template.arcs[0].ops[0].at'],
    ['a roll op on a sustained lane', (value: MutableTemplate) => {
      value.arcs[0]!.ops = [{ op: 'roll', lane: 5, at: value.arcs[0]!.sections[1]!.name }]
    }, 'template.arcs[0].ops[0].lane'],
    ['a rest op without a range', (value: MutableTemplate) => {
      value.arcs[0]!.ops = [{ op: 'rest', lane: 5, at: value.arcs[0]!.sections[1]!.name }]
    }, 'template.arcs[0].ops[0].at']
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
