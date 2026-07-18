import { canonicalMusicalKey } from './musical-key'
import type {
  AnalysisGroupState,
  PersistedAnalysisGroup,
  StoredAnalysisEvidence
} from './analysis-persistence'

const MIN_GROUP_SIZE = 4
const MIN_TEMPO_BPM = 60
const MAX_TEMPO_BPM = 200
const TEMPO_BIN_SCALE = 2
const TEMPO_ALIASES = [0.5, 2 / 3, 0.75, 0.8, 1, 1.25, 4 / 3, 1.5, 2] as const
const TEMPO_TOLERANCE = 0.025

export interface ContextualAnalysisResult {
  samples: Array<{ sampleId: number; bpm: number | null; musicalKey: string | null }>
  groups: PersistedAnalysisGroup[]
}

interface GroupInference extends PersistedAnalysisGroup {
  bpmMixed: boolean
  keyMixed: boolean
}

function persistedGroup(group: GroupInference): PersistedAnalysisGroup {
  return {
    relpathPrefix: group.relpathPrefix,
    depth: group.depth,
    sampleCount: group.sampleCount,
    state: group.state,
    bpm: group.bpm,
    musicalKey: group.musicalKey,
    bpmSupport: group.bpmSupport,
    keySupport: group.keySupport,
    confidence: group.confidence
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function directoryPrefixes(relpath: string): string[] {
  const segments = relpath.split('/').filter(Boolean)
  const prefixes = ['']
  let prefix = ''
  for (const segment of segments.slice(0, -1)) {
    prefix = prefix === '' ? segment : `${prefix}/${segment}`
    prefixes.push(prefix)
  }
  return prefixes
}

function labeledBpm(value: string): number | null {
  const structured = /(?:^|_)([6-9][0-9]|1[0-9]{2}|200)_([a-g](?:#|b)?m?)_(?:sc|sl)[0-9]+(?=$|[_.(])/i.exec(value)
  if (structured) return Number(structured[1])
  const match = /(?:^|[^a-z0-9])(?:bpm[\s_.-]*([0-9]{2,3})|([0-9]{2,3})[\s_.-]*bpm)(?=$|[^a-z0-9])/i.exec(value)
  const bpm = Number(match?.[1] ?? match?.[2])
  return Number.isFinite(bpm) && bpm >= MIN_TEMPO_BPM && bpm <= MAX_TEMPO_BPM ? bpm : null
}

function labeledKey(value: string): string | null {
  const structured = /(?:^|_)([6-9][0-9]|1[0-9]{2}|200)_([a-g](?:#|b)?m?)_(?:sc|sl)[0-9]+(?=$|[_.(])/i.exec(value)
  if (structured && /m$/i.test(structured[2]!)) return canonicalMusicalKey(structured[2]!)
  const matches = value.matchAll(
    /(?:^|[^a-z])([a-g](?:#|b)?(?:m|min|minor|maj|major))(?=$|[^a-z])/gi
  )
  let key: string | null = null
  for (const match of matches) {
    const token = match[1]!
      .replace(/minor$/i, 'm')
      .replace(/min$/i, 'm')
      .replace(/major$/i, '')
      .replace(/maj$/i, '')
    key = canonicalMusicalKey(token) ?? key
  }
  return key
}

function cohortGroupPrefix(relpath: string): string | null {
  const segments = relpath.split('/').filter(Boolean)
  const token = /(?:^|_)((?:sc|sl)[0-9]+)(?=$|[_.(])/i.exec(segments.at(-1) ?? '')?.[1]
  if (!token) return null
  const topLevel = segments.length > 1 ? segments[0]! : ''
  return `@cohort/${topLevel}/${token.toUpperCase()}`
}

function cohortKey(relpath: string): string {
  const slash = relpath.lastIndexOf('/')
  const directory = slash < 0 ? '' : relpath.slice(0, slash + 1).toLowerCase()
  const filename = (slash < 0 ? relpath : relpath.slice(slash + 1))
    .replace(/\.[^.]+$/, '')
    .replace(/(?:\([lr]\)|[_\s.-][lr])$/i, '')
    .replace(/([a-z]+)[0-9]{3,}(?=_)/i, '$1#')
    .toLowerCase()
  return directory + filename
}

function collapseCohorts(items: readonly StoredAnalysisEvidence[]): StoredAnalysisEvidence[] {
  const cohorts = new Map<string, StoredAnalysisEvidence[]>()
  for (const item of items) {
    const key = cohortKey(item.relpath)
    const cohort = cohorts.get(key)
    if (cohort) cohort.push(item)
    else cohorts.set(key, [item])
  }
  return [...cohorts.values()].map((cohort) => {
    const first = cohort[0]!
    const bpms = cohort.flatMap((item) => item.bpm === null ? [] : [item.bpm])
    const keys = cohort.flatMap((item) => item.musicalKey === null ? [] : [item.musicalKey])
    const durations = cohort.map((item) => item.durationSeconds).filter((duration) => duration > 0)
      .sort((left, right) => left - right)
    return {
      ...first,
      bpm: dominantValue(bpms).value,
      musicalKey: dominantValue(keys).value,
      durationSeconds: durations[Math.floor(durations.length / 2)] ?? first.durationSeconds
    }
  })
}

function isTempoAnchor(item: StoredAnalysisEvidence): boolean {
  if (item.durationSeconds < 1.5) return false
  return item.sampleType !== null &&
    ['Bass', 'Synth', 'Loop', 'Vocal', 'Atmosphere'].includes(item.sampleType)
}

function isKeyAnchor(item: StoredAnalysisEvidence): boolean {
  return item.sampleType !== null &&
    ['Bass', 'Synth', 'Loop', 'Vocal', 'Atmosphere'].includes(item.sampleType)
}

function dominantValue<T>(values: readonly T[]): {
  value: T | null
  count: number
  secondCount: number
} {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const ranked = [...counts].sort((left, right) => right[1] - left[1])
  return {
    value: ranked[0]?.[0] ?? null,
    count: ranked[0]?.[1] ?? 0,
    secondCount: ranked[1]?.[1] ?? 0
  }
}

function tempoCompatible(candidate: number, detected: number): boolean {
  return TEMPO_ALIASES.some((alias) =>
    Math.abs(detected * alias - candidate) / candidate <= TEMPO_TOLERANCE
  )
}

function directTempoClusters(values: readonly number[]): Array<{ bpm: number; count: number }> {
  const bins = new Map<number, number>()
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue
    const bin = Math.round(value * TEMPO_BIN_SCALE)
    bins.set(bin, (bins.get(bin) ?? 0) + 1)
  }
  return [...bins]
    .map(([bin, count]) => ({ bpm: bin / TEMPO_BIN_SCALE, count }))
    .sort((left, right) => right.count - left.count || left.bpm - right.bpm)
}

function durationTempo(items: readonly StoredAnalysisEvidence[]): {
  bpm: number | null
  support: number
  winnerRatio: number
} {
  const votes = new Map<number, number>()
  let usable = 0
  for (const item of items) {
    const duration = item.durationSeconds
    if (!Number.isFinite(duration) || duration <= 0) continue
    usable++
    const firstBeatCount = Math.max(1, Math.ceil(duration * MIN_TEMPO_BPM / 60))
    const lastBeatCount = Math.floor(duration * MAX_TEMPO_BPM / 60)
    const fileBins = new Set<number>()
    for (let beats = firstBeatCount; beats <= lastBeatCount; beats++) {
      fileBins.add(Math.round((beats * 60 / duration) * TEMPO_BIN_SCALE))
    }
    for (const bin of fileBins) votes.set(bin, (votes.get(bin) ?? 0) + 1)
  }
  const ranked = [...votes].sort((left, right) => right[1] - left[1] || left[0] - right[0])
  const winner = ranked[0]
  if (!winner || usable === 0) return { bpm: null, support: 0, winnerRatio: 0 }
  const secondCount = ranked[1]?.[1] ?? 0
  return {
    bpm: winner[0] / TEMPO_BIN_SCALE,
    support: winner[1] / usable,
    winnerRatio: secondCount === 0 ? 1 : winner[1] / secondCount
  }
}

function inferGroup(relpathPrefix: string, items: readonly StoredAnalysisEvidence[]): GroupInference {
  const evidenceItems = collapseCohorts(items)
  const tempoAnchors = evidenceItems.filter(isTempoAnchor)
  const rawBpms = tempoAnchors.flatMap((item) => item.bpm === null ? [] : [item.bpm])
  const rawKeys = evidenceItems.filter(isKeyAnchor).flatMap((item) => {
    const key = item.musicalKey === null ? null : canonicalMusicalKey(item.musicalKey)
    return key === null ? [] : [key]
  })
  const pathBpms = evidenceItems.flatMap((item) => {
    const bpm = labeledBpm(item.relpath)
    return bpm === null ? [] : [bpm]
  })
  const pathKeys = evidenceItems.flatMap((item) => {
    const key = labeledKey(item.relpath)
    return key === null ? [] : [key]
  })

  const directClusters = directTempoClusters(rawBpms)
  const firstDirect = directClusters[0]
  const secondDirect = directClusters.find((cluster) =>
    firstDirect !== undefined && !tempoCompatible(firstDirect.bpm, cluster.bpm) &&
      !tempoCompatible(cluster.bpm, firstDirect.bpm)
  )
  const pathTempo = dominantValue(pathBpms)
  const pathTempoMixed = pathTempo.value !== null && pathTempo.secondCount > 0 &&
    pathTempo.count / pathBpms.length < 0.7 && pathTempo.secondCount / pathBpms.length >= 0.3
  const rawTempoMixed = evidenceItems.length >= MIN_GROUP_SIZE && firstDirect !== undefined &&
    secondDirect !== undefined &&
    firstDirect.count / rawBpms.length >= 0.3 && secondDirect.count / rawBpms.length >= 0.3
  const bpmMixed = pathTempoMixed || (pathTempo.value === null && rawTempoMixed)

  let bpm: number | null = null
  let bpmSupport = 0
  if (!bpmMixed && pathTempo.value !== null &&
      pathTempo.count >= Math.ceil(pathBpms.length * 0.6) &&
      pathTempo.count > pathTempo.secondCount) {
    bpm = pathTempo.value
    bpmSupport = pathTempo.count / Math.max(1, pathBpms.length)
  } else if (!bpmMixed && tempoAnchors.length >= MIN_GROUP_SIZE) {
    const duration = durationTempo(tempoAnchors)
    const compatibleRaw = duration.bpm === null ? 0 : rawBpms.filter((value) =>
      tempoCompatible(duration.bpm!, value)
    ).length
    const acousticSupport = compatibleRaw / Math.max(1, rawBpms.length)
    if (duration.bpm !== null && duration.support >= 0.75 && duration.winnerRatio >= 1.03 &&
        rawBpms.length >= Math.min(MIN_GROUP_SIZE, tempoAnchors.length) && acousticSupport >= 0.5) {
      bpm = duration.bpm
      bpmSupport = Math.min(duration.support, acousticSupport)
    } else if (firstDirect && firstDirect.count >= MIN_GROUP_SIZE &&
        firstDirect.count / rawBpms.length >= 0.7 &&
        (secondDirect?.count ?? 0) / rawBpms.length < 0.25) {
      bpm = firstDirect.bpm
      bpmSupport = firstDirect.count / rawBpms.length
    }
  }

  const pathKey = dominantValue(pathKeys)
  const rawKey = dominantValue(rawKeys)
  const pathKeyMixed = pathKey.value !== null && pathKey.secondCount > 0 &&
    pathKey.count / pathKeys.length < 0.7 && pathKey.secondCount / pathKeys.length >= 0.3
  const rawKeyMixed = rawKeys.length >= MIN_GROUP_SIZE && rawKey.count / rawKeys.length < 0.65 &&
    rawKey.secondCount / rawKeys.length >= 0.3
  const keyMixed = pathKeyMixed || (pathKey.value === null && rawKeyMixed)
  let musicalKey: string | null = null
  let keySupport = 0
  if (!keyMixed && pathKey.value !== null &&
      pathKey.count >= Math.ceil(pathKeys.length * 0.6) &&
      pathKey.count > pathKey.secondCount) {
    musicalKey = pathKey.value
    keySupport = pathKey.count / Math.max(1, pathKeys.length)
  } else if (!keyMixed && rawKey.value !== null && rawKeys.length >= MIN_GROUP_SIZE &&
      rawKey.count / rawKeys.length >= 0.55 &&
      (rawKey.secondCount === 0 || rawKey.count / rawKey.secondCount >= 2)) {
    musicalKey = rawKey.value
    keySupport = rawKey.count / rawKeys.length
  }

  const state: AnalysisGroupState = bpmMixed || keyMixed
    ? 'mixed'
    : bpm !== null || musicalKey !== null ? 'resolved' : 'uncertain'
  const supports = [bpm === null ? null : bpmSupport, musicalKey === null ? null : keySupport]
    .filter((support): support is number => support !== null)
  const confidence = supports.length === 0
    ? 0
    : supports.reduce((sum, support) => sum + support, 0) / supports.length

  return {
    relpathPrefix,
    depth: relpathPrefix === '' ? 0 : relpathPrefix.split('/').length,
    sampleCount: items.length,
    state,
    bpm,
    musicalKey,
    bpmSupport: clamp01(bpmSupport),
    keySupport: clamp01(keySupport),
    confidence: clamp01(confidence),
    bpmMixed,
    keyMixed
  }
}

function parentGroupKeys(relpathPrefix: string): string[] {
  if (relpathPrefix === '') return []
  if (relpathPrefix.startsWith('@cohort/')) {
    const topLevel = relpathPrefix.split('/')[1] ?? ''
    return topLevel === '' ? [''] : [topLevel, '']
  }
  const segments = relpathPrefix.split('/')
  const parents: string[] = []
  while (segments.length > 1) {
    segments.pop()
    parents.push(segments.join('/'))
  }
  parents.push('')
  return parents
}

function stabilizeChildGroups(groups: GroupInference[]): void {
  const byPrefix = new Map(groups.map((group) => [group.relpathPrefix, group]))
  for (const group of groups) {
    if (group.state !== 'resolved') continue
    const parents = parentGroupKeys(group.relpathPrefix)
      .map((key) => byPrefix.get(key))
      .filter((parent): parent is GroupInference => parent !== undefined)

    if (group.bpm !== null) {
      const parent = parents.find((candidate) => candidate.state === 'resolved' && candidate.bpm !== null)
      if (parent && parent.bpm !== group.bpm && group.bpmSupport < 0.8 && parent.bpmSupport >= 0.6) {
        group.bpm = parent.bpm
        group.bpmSupport = parent.bpmSupport
      }
    }
    if (group.musicalKey !== null) {
      const parent = parents.find(
        (candidate) => candidate.state === 'resolved' && candidate.musicalKey !== null
      )
      if (parent && parent.musicalKey !== group.musicalKey &&
          group.keySupport < 0.8 && parent.keySupport >= 0.6) {
        group.musicalKey = parent.musicalKey
        group.keySupport = parent.keySupport
      }
    }

    const supports = [
      group.bpm === null ? null : group.bpmSupport,
      group.musicalKey === null ? null : group.keySupport
    ].filter((support): support is number => support !== null)
    group.confidence = supports.length === 0
      ? 0
      : supports.reduce((sum, support) => sum + support, 0) / supports.length
  }
}

function explicitSampleEvidence(item: StoredAnalysisEvidence): {
  bpm: number | null
  musicalKey: string | null
} {
  return { bpm: labeledBpm(item.relpath), musicalKey: labeledKey(item.relpath) }
}

export function resolveContextualAnalysis(
  items: readonly StoredAnalysisEvidence[]
): ContextualAnalysisResult {
  const grouped = new Map<string, StoredAnalysisEvidence[]>()
  for (const item of items) {
    const prefixes = directoryPrefixes(item.relpath)
    const cohort = cohortGroupPrefix(item.relpath)
    if (cohort) prefixes.push(cohort)
    for (const prefix of prefixes) {
      const group = grouped.get(prefix)
      if (group) group.push(item)
      else grouped.set(prefix, [item])
    }
  }
  if (!grouped.has('')) grouped.set('', [])

  const inferred = [...grouped]
    .map(([prefix, groupItems]) => inferGroup(prefix, groupItems))
    .sort((left, right) => left.depth - right.depth || left.relpathPrefix.localeCompare(right.relpathPrefix))
  stabilizeChildGroups(inferred)
  const byPrefix = new Map(inferred.map((group) => [group.relpathPrefix, group]))

  const samples = items.map((item) => {
    const explicit = explicitSampleEvidence(item)
    let bpm = explicit.bpm ?? item.bpm
    let musicalKey = explicit.musicalKey ?? item.musicalKey
    const directories = directoryPrefixes(item.relpath).reverse()
    const cohort = cohortGroupPrefix(item.relpath)
    const prefixes = cohort === null ? directories : [cohort, ...directories]
    if (explicit.bpm === null) {
      for (const prefix of prefixes) {
        const group = byPrefix.get(prefix)!
        if (group.bpmMixed) continue
        if (group.bpm !== null) {
          bpm = group.bpm
          break
        }
      }
    }
    if (explicit.musicalKey === null) {
      for (const prefix of prefixes) {
        const group = byPrefix.get(prefix)!
        if (group.keyMixed) continue
        if (group.musicalKey !== null) {
          musicalKey = group.musicalKey
          break
        }
      }
    }
    return { sampleId: item.id, bpm, musicalKey }
  })

  return {
    samples,
    groups: inferred.map(persistedGroup)
  }
}
