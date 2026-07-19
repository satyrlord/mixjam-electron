const GENERATOR_PROFILE_ID_PATTERN = /^(?=.{1,64}$)[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isGeneratorProfileId(value: unknown): value is string {
  return typeof value === 'string' && GENERATOR_PROFILE_ID_PATTERN.test(value)
}
