import type { SampleListItem, TagItem, CategoryItem } from '../../../shared/ipc'

export function generateMockTags(): TagItem[] {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2']
  const tagNames = [
    'Drum',
    'Bass',
    'Pad',
    'Synth',
    'Vocal',
    'Guitar',
    'Piano',
    'Strings',
    'Ambient',
    'Electronic',
    'Upbeat',
    'Chill'
  ]

  return tagNames.map((name, i) => ({
    id: i + 1,
    name,
    color: colors[i % colors.length]
  }))
}

export function generateMockCategories(): CategoryItem[] {
  return [
    { id: 1, name: 'Drums', parentId: null },
    { id: 2, name: 'Kicks', parentId: 1 },
    { id: 3, name: 'Snares', parentId: 1 },
    { id: 4, name: 'Hi-Hats', parentId: 1 },
    { id: 5, name: 'Instruments', parentId: null },
    { id: 6, name: 'Bass', parentId: 5 },
    { id: 7, name: 'Strings', parentId: 5 },
    { id: 8, name: 'Pads', parentId: 5 },
    { id: 9, name: 'Synths', parentId: 5 },
    { id: 10, name: 'Vocals', parentId: null },
    { id: 11, name: 'Ambient', parentId: null }
  ]
}

const DRUM_KICKS = [
  'Kick_DeepSub_808',
  'Kick_House_Punchy',
  'Kick_Tech_Tight',
  'Kick_Acoustic_Thump',
  'Kick_Minimal_Click',
  'Kick_DubStep_Heavy',
  'Kick_Trap_Rattling',
  'Kick_Electro_Pitched'
]

const DRUM_SNARES = [
  'Snare_Crisp_Pop',
  'Snare_Reverb_Tail',
  'Snare_Clap_Tight',
  'Snare_Acoustic_Hard',
  'Snare_Pitched_Down',
  'Snare_Rimshot_Click',
  'Snare_Layered_Rich'
]

const DRUM_HIHATS = [
  'HiHat_Closed_Crisp',
  'HiHat_Open_Shimmer',
  'HiHat_Pedal_Control',
  'HiHat_Sizzle_Vintage',
  'HiHat_Tight_Trap',
  'HiHat_Swung_Groove'
]

interface SampleTemplate {
  name: string
  categoryId: number
  duration: number
  bpm?: number
  key?: string
  tagIds: number[]
}

const SAMPLE_TEMPLATES: SampleTemplate[] = [
  // Drums - Kicks
  { name: 'Kick_DeepSub_808', categoryId: 2, duration: 0.5, tagIds: [1] },
  { name: 'Kick_House_Punchy', categoryId: 2, duration: 0.4, tagIds: [1] },
  { name: 'Kick_Tech_Tight', categoryId: 2, duration: 0.45, tagIds: [1] },
  { name: 'Kick_Acoustic_Thump', categoryId: 2, duration: 0.55, tagIds: [1] },
  { name: 'Kick_Minimal_Click', categoryId: 2, duration: 0.3, tagIds: [1] },
  { name: 'Kick_DubStep_Heavy', categoryId: 2, duration: 0.6, tagIds: [1] },
  { name: 'Kick_Trap_Rattling', categoryId: 2, duration: 0.35, tagIds: [1] },
  { name: 'Kick_Electro_Pitched', categoryId: 2, duration: 0.4, tagIds: [1] },
  // Drums - Snares
  { name: 'Snare_Crisp_Pop', categoryId: 3, duration: 0.25, tagIds: [1] },
  { name: 'Snare_Reverb_Tail', categoryId: 3, duration: 0.35, tagIds: [1] },
  { name: 'Snare_Clap_Tight', categoryId: 3, duration: 0.2, tagIds: [1] },
  { name: 'Snare_Acoustic_Hard', categoryId: 3, duration: 0.22, tagIds: [1] },
  // Drums - Hi-Hats
  { name: 'HiHat_Closed_Crisp', categoryId: 4, duration: 0.15, tagIds: [1] },
  { name: 'HiHat_Open_Shimmer', categoryId: 4, duration: 0.25, tagIds: [1] },
  // Bass
  { name: 'Bass_Sub_Deep', categoryId: 6, duration: 2.5, bpm: 128, key: 'C', tagIds: [2] },
  { name: 'Bass_Reese_Saw', categoryId: 6, duration: 2.0, bpm: 128, key: 'D', tagIds: [2] },
  { name: 'Bass_Pluck_Muted', categoryId: 6, duration: 1.5, bpm: 128, key: 'E', tagIds: [2] },
  // Pads
  { name: 'Pad_Atmospheric_Lush', categoryId: 8, duration: 6.0, tagIds: [3, 9] },
  { name: 'Pad_Strings_Legato', categoryId: 8, duration: 5.5, tagIds: [3, 9] },
  { name: 'Pad_Synth_Wavy', categoryId: 8, duration: 7.0, tagIds: [3, 9] },
  // Synths
  { name: 'Synth_Lead_Bright', categoryId: 9, duration: 2.0, bpm: 128, key: 'A', tagIds: [4, 10] },
  { name: 'Synth_Bell_Clear', categoryId: 9, duration: 1.5, bpm: 128, key: 'B', tagIds: [4, 10] },
  { name: 'Synth_Wobble_Modulated', categoryId: 9, duration: 2.5, bpm: 128, key: 'C', tagIds: [4, 10] },
  // Vocals
  { name: 'Vocal_Ah_Female', categoryId: 10, duration: 1.5, tagIds: [5] },
  { name: 'Vocal_Oh_Male', categoryId: 10, duration: 1.2, tagIds: [5] },
  // Ambient
  { name: 'Ambient_Rain_Texture', categoryId: 11, duration: 10.0, tagIds: [9, 11] },
  { name: 'Ambient_Wind_Pad', categoryId: 11, duration: 12.0, tagIds: [9, 11] },
  { name: 'Ambient_Forest_Soundscape', categoryId: 11, duration: 15.0, tagIds: [9, 11] }
]

export function generateMockSamples(tags: TagItem[], categories: CategoryItem[]): SampleListItem[] {
  let dbId = 1

  return SAMPLE_TEMPLATES.map((template) => {
    const category = categories.find((c) => c.id === template.categoryId)
    // Ensure name is always a string
    const sampleName = template.name || `Sample_${dbId}`
    // Filter out invalid tag ids and map to names
    const validTags = template.tagIds
      .map((tid) => tags.find((t) => t.id === tid)?.name)
      .filter((name) => name !== undefined && name !== null && name !== '')
    
    return {
      id: `sample_${dbId}`,
      dbId: dbId++,
      name: sampleName,
      filepath: `samples/${category?.name ?? 'uncategorized'}/${sampleName}.wav`,
      category: category?.name ?? 'Uncategorized',
      durationSeconds: Math.round(template.duration * 100) / 100,
      tags: validTags as string[],
      categoryId: template.categoryId,
      tagIds: template.tagIds
    }
  })
}
