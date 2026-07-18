export const SAMPLE_TYPE_VALUES = [
  'Kick', 'Snare', 'Hi-hat', 'Percussion', 'Bass', 'Synth',
  'FX', 'Vocal', 'Loop', 'Atmosphere', 'Other'
] as const

export type SampleType = (typeof SAMPLE_TYPE_VALUES)[number]
