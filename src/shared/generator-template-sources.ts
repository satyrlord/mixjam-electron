import ambientHouse from './generator-templates/templates/ambient-house.json'
import house from './generator-templates/templates/house.json'
import melodicTechno from './generator-templates/templates/melodic-techno.json'
import techno from './generator-templates/templates/techno.json'
import trance from './generator-templates/templates/trance.json'
import tropicalHouse from './generator-templates/templates/tropical-house.json'

// Bundled-template membership, stated explicitly rather than globbed. A glob
// resolves only under the Vite bundler, which made the shipped engine
// unimportable from a plain Node process — and the headless CLI that proves the
// engine works is a plain Node process. Adding a template means adding a line
// here; the registry still owns validation, ordering, and atomic rejection.
export const BUNDLED_GENERATOR_TEMPLATE_SOURCES: Readonly<Record<string, unknown>> = {
  './generator-templates/templates/ambient-house.json': ambientHouse,
  './generator-templates/templates/house.json': house,
  './generator-templates/templates/melodic-techno.json': melodicTechno,
  './generator-templates/templates/techno.json': techno,
  './generator-templates/templates/trance.json': trance,
  './generator-templates/templates/tropical-house.json': tropicalHouse
}
