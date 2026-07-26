// E2E mock BackendAPI — bundled as a plain .js file and inlined into the
// Playwright browser context via addInitScript at test time.
//
// Must be plain ES5-compatible JavaScript (no imports, no TypeScript,
// no arrow functions in object methods where `this` matters).
// Structured-clone cannot serialize functions, so the entire mock must
// be a string that executes in the Electron renderer context.
// This is the SOURCE file; tests/e2e/fixtures.ts reads and inlines it.
// Keep the IIFE wrapper so variables stay local.
(function () {
  var MOCK_FOLDER_SELECTIONS = {
    userFolder: { id: 'e2e-user-folder', name: 'MixJam' },
    sampleFolder: { id: 'e2e-sample-folder', name: 'Samples' }
  }

  var MOCK_MIXJAM_FILES = [
    { path: 'club-night.mixjam', displayName: 'club-night', lastOpened: '2026-06-28T12:00:00.000Z' },
    { path: 'archive/sunrise.mixjam', displayName: 'sunrise', lastOpened: null },
    { path: 'ideas/after-hours.mixjam', displayName: 'after-hours', lastOpened: null },
    {
      path: 'sketches/deep-water-session-with-an-unusually-long-project-name-for-layout-stress-that-keeps-going.mixjam',
      displayName: 'deep-water-session-with-an-unusually-long-project-name-for-layout-stress-that-keeps-going',
      lastOpened: '2026-06-20T12:00:00.000Z'
    },
    { path: 'archive/warehouse.mixjam', displayName: 'warehouse', lastOpened: null },
    { path: 'ideas/low-tide.mixjam', displayName: 'low-tide', lastOpened: null },
    { path: 'sketches/blue-hour.mixjam', displayName: 'blue-hour', lastOpened: null },
    { path: 'archive/slow-motion.mixjam', displayName: 'slow-motion', lastOpened: null }
  ]

  var MOCK_TAGS = [
    { id: 1, name: 'fav', color: '#ffcc00', origin: 'user', folderDerived: false },
    { id: 2, name: 'Bass', color: null, origin: 'folder', folderDerived: true },
    { id: 3, name: 'Hard Trance', color: null, origin: 'folder', folderDerived: true },
    { id: 4, name: 'House', color: null, origin: 'folder', folderDerived: true },
    { id: 5, name: 'Drums', color: null, origin: 'folder', folderDerived: true },
    { id: 6, name: 'Unsorted', color: null, origin: 'folder', folderDerived: true },
    { id: 7, name: 'Review', color: '#00674f', origin: 'user', folderDerived: false }
  ]
  var nextTagId = 8

  var MOCK_SAMPLES = [
    { id: 1, relpath: 'Hard Trance/Bass/kick_808.wav', filename: 'kick_808.wav', ext: 'wav', sizeBytes: 1024, duration: 0.5, sampleRate: 44100, channels: 1, bpm: 120, bpmSource: 'analysis', musicalKey: 'C', musicalKeySource: 'analysis', sampleType: 'Kick', sampleTypeSource: 'analysis', dateAdded: 1000, scanState: 1, tagIds: [2, 3], folderTagIds: [2, 3], userTagIds: [], tags: ['Bass', 'Hard Trance'] },
    { id: 2, relpath: 'House/Bass/snare_clap.wav', filename: 'snare_clap.wav', ext: 'wav', sizeBytes: 2048, duration: 0.3, sampleRate: 44100, channels: 1, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: 'Snare', sampleTypeSource: 'analysis', dateAdded: 1001, scanState: 1, tagIds: [2, 4], folderTagIds: [2, 4], userTagIds: [], tags: ['Bass', 'House'] },
    { id: 3, relpath: 'Hard Trance/Drums/deep_sub.wav', filename: 'deep_sub.wav', ext: 'wav', sizeBytes: 4096, duration: 1.2, sampleRate: 44100, channels: 1, bpm: null, bpmSource: null, musicalKey: 'C', musicalKeySource: 'analysis', sampleType: 'Bass', sampleTypeSource: 'analysis', dateAdded: 1002, scanState: 1, tagIds: [3, 5], folderTagIds: [3, 5], userTagIds: [], tags: ['Drums', 'Hard Trance'] },
    { id: 4, relpath: 'House/Drums/pad_warm.wav', filename: 'pad_warm.wav', ext: 'wav', sizeBytes: 8192, duration: 2.0, sampleRate: 44100, channels: 2, bpm: 120, bpmSource: 'analysis', musicalKey: 'C', musicalKeySource: 'analysis', sampleType: 'Synth', sampleTypeSource: 'analysis', dateAdded: 1003, scanState: 1, tagIds: [4, 5], folderTagIds: [4, 5], userTagIds: [], tags: ['Drums', 'House'] },
    { id: 5, relpath: 'riser_imp.wav', filename: 'riser_imp.wav', ext: 'wav', sizeBytes: 1536, duration: 0.8, sampleRate: 44100, channels: 1, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: 'FX', sampleTypeSource: 'analysis', dateAdded: 1004, scanState: 1, tagIds: [1, 6], folderTagIds: [6], userTagIds: [1], tags: ['fav', 'Unsorted'] }
  ]

  var MOCK_LIBRARY_JOB = {
    rootKey: MOCK_FOLDER_SELECTIONS.sampleFolder.id,
    jobId: 'e2e-library-job',
    trigger: 'automatic'
  }
  var scanProgressListeners = []
  var scanDoneListeners = []
  var analysisProgressListeners = []
  var analysisDoneListeners = []
  var generatorProgressListeners = []

  function subscribe(listeners, listener) {
    listeners.push(listener)
    return function () {
      var index = listeners.indexOf(listener)
      if (index !== -1) listeners.splice(index, 1)
    }
  }

  function emit(listeners, payload) {
    listeners.slice().forEach(function (listener) { listener(payload) })
  }

  window.__mixjamE2EBackend = {
    emitScanProgress: function (progress) { emit(scanProgressListeners, progress) },
    emitScanDone: function (done) { emit(scanDoneListeners, done) },
    emitAnalysisProgress: function (progress) { emit(analysisProgressListeners, progress) },
    emitAnalysisDone: function (identity) { emit(analysisDoneListeners, { identity: identity }) }
  }

  function querySamples(req) {
    var rows = MOCK_SAMPLES.slice()
    if (req.textSearch) {
      var q = req.textSearch.trim().toLowerCase()
      rows = rows.filter(function (r) { return (r.filename + ' ' + r.relpath).toLowerCase().indexOf(q) !== -1 })
    }
    if (req.tagIds && req.tagIds.length) {
      rows = rows.filter(function (r) {
        return req.tagIds.every(function (id) { return r.tagIds.indexOf(id) !== -1 })
      })
    }
    var total = rows.length
    var offset = req.offset || 0
    var limit = req.limit || 200
    return { rows: rows.slice(offset, offset + limit), total: total }
  }

  // Mirror the bundled-template registry versions so the persisted generator
  // block is recognised as exactly regenerable (supportsExactGeneratorRegeneration
  // requires generatorVersion === MIXJAM_GENERATOR_VERSION and profileVersion ===
  // the running template version). Bump these alongside the constants they mock:
  // MIXJAM_GENERATOR_VERSION in src/shared/backend-api.ts and each template's
  // "version" in src/shared/generator-templates/templates/*.json.
  var MOCK_GENERATOR_VERSION = 3
  var MOCK_PROFILE_VERSIONS = {
    techno: 6, trance: 6, house: 6,
    'melodic-techno': 3, 'ambient-house': 3, 'tropical-house': 3
  }

  function generatorPlan(parameters) {
    var bpm = parameters.bpmMode === 'fixed' ? parameters.bpm : 120
    var bars = Math.max(1, Math.floor(parameters.durationSeconds * bpm / 240 + 0.5))
    var targetTicks = bars * 32
    var lanes = []
    for (var index = 0; index < 16; index++) {
      lanes.push({
        index: index,
        name: index === 0 ? 'Kick' : 'Generator ' + (index + 1),
        gain: index === 0 ? 0.78 : 0.5,
        pan: 0,
        muted: false,
        solo: false,
        sends: index === 0 ? [0, 0] : [0.2, 0.1],
        placements: index === 0 ? [
          { id: 'generator-kick-start', sampleRef: MOCK_SAMPLES[0].relpath, sampleName: MOCK_SAMPLES[0].filename, startTick: 0, durationTicks: 8, durationSeconds: 0.5, nativeBpm: 120, slot: 2 },
          { id: 'generator-kick-end', sampleRef: MOCK_SAMPLES[0].relpath, sampleName: MOCK_SAMPLES[0].filename, startTick: targetTicks - 8, durationTicks: 8, durationSeconds: 0.5, nativeBpm: 120, slot: 2 }
        ] : []
      })
    }
    return {
      generatorVersion: MOCK_GENERATOR_VERSION,
      profileId: parameters.profileId,
      profileVersion: MOCK_PROFILE_VERSIONS[parameters.profileId] || 1,
      arcName: 'Tunnel',
      seed: parameters.seed,
      parameters: { bpmMode: parameters.bpmMode, resolvedBpm: bpm, intensity: parameters.intensity, durationSeconds: parameters.durationSeconds },
      corpusFingerprint: 'e2e-fingerprint',
      sampleFolderKey: MOCK_FOLDER_SELECTIONS.sampleFolder.id,
      targetBars: bars,
      targetTicks: targetTicks,
      quantizedDurationSeconds: bars * 240 / bpm,
      dominantKey: 'C',
      poolToken: null,
      analysis: { attemptedFiles: 5, analyzedFiles: 5, uniqueReads: 5 },
      selections: [{ laneIndex: 0, requestedType: 'Kick', selectedType: 'Kick', sampleRefs: [MOCK_SAMPLES[0].relpath] }],
      substitutions: [],
      sections: [{ name: 'Intro', startBar: 0, endBar: bars, activeLanes: [0] }],
      phrases: [{ sectionIndex: 0, startBar: 0, endBar: Math.min(8, bars), activeLanes: [0] }],
      returns: [
        { index: 0, module: 'aetherform-reverb', preset: 'Small Room', returnLevel: 0.3 },
        { index: 1, module: 'echoform-delay', preset: 'Wide Tape Echo', returnLevel: 0.28 }
      ],
      lanes: lanes
    }
  }

  function mockWavBytes() {
    var sampleRate = 8000
    var sampleCount = 4000
    var buffer = new ArrayBuffer(44 + sampleCount * 2)
    var view = new DataView(buffer)
    function text(offset, value) {
      for (var index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
    }
    text(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); text(8, 'WAVE')
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, sampleCount * 2, true)
    for (var index = 0; index < sampleCount; index++) {
      view.setInt16(44 + index * 2, Math.round(Math.sin(2 * Math.PI * 110 * index / sampleRate) * 10000), true)
    }
    return buffer
  }

  function makeProject(name, bpm) {
    var lanes = []
    for (var i = 0; i < 8; i += 1) {
      lanes.push({
        id: 'lane-' + (i + 1),
        name: 'Lane ' + (i + 1),
        gain: i === 0 ? 0.64 : 0.8,
        muted: false,
        solo: false,
        pan: 0,
        sends: [0, 0, 0, 0],
        placements: i === 0 ? [{
          id: 'placement-' + name,
          sampleRef: 'Hard Trance/Bass/kick_808.wav',
          sampleName: 'kick_808.wav',
          nativeBPM: 120,
          startTick: 0,
          durationTicks: 32,
          durationSeconds: 0.5,
          slot: 2
        }] : []
      })
    }
    return JSON.stringify({
      formatVersion: 7,
      appVersion: 'v0.test.0',
      createdAt: '2026-06-28T12:00:00.000Z',
      modifiedAt: '2026-06-28T12:00:00.000Z',
      song: { bpm: bpm, masterGain: 0.7, clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 } },
      masterBus: {
        order: ['clip', 'tube', 'subeq', 'comp', 'max', 'addeq', 'tape', 'width', 'mbc', 'lim'],
        power: {
          clip: true, tube: true, subeq: true, comp: true, max: true,
          addeq: true, tape: true, width: true, mbc: true, lim: true
        },
        params: {
          'gain.trim': 0, 'clip.amount': 1.5, 'clip.ceil': -0.5, 'tube.drive': 2.5, 'tube.mix': 100,
          'subeq.hp': 20, 'subeq.mud': -1.5, 'subeq.harsh': -1,
          'comp.thr': -16, 'comp.ratio': 2, 'comp.att': 10, 'comp.rel': 300,
          'max.boost': 10, 'addeq.low': 1, 'addeq.air': 1, 'tape.drive': 2, 'tape.ips': 1,
          'width.width': 105, 'width.mono': 120, 'mbc.lo': 20, 'mbc.mid': 15, 'mbc.hi': 20,
          'lim.gain': 4, 'lim.ceil': -1
        },
        preset: 'Cheat Sheet'
      },
      lanes: lanes,
      fxBuses: [1, 2, 3, 4].map(function (slot) {
        return {
          id: 'fx-' + slot,
          index: slot - 1,
          name: 'FX' + slot,
          module: slot === 1
            ? {
                type: 'echoform-delay', mode: 'sync', divisionL: '1/4', divisionR: '1/8.',
                timeMsL: 420, timeMsR: 610, feedback: 68, pingPong: true, width: 142,
                lowCut: 160, highCut: 7800, modRate: 0.38, modDepth: 5.4, character: 'tape',
                drive: 0, duckAmount: 34, duckRelease: 620, outputDb: -1.5, bypass: false
              }
            : { type: 'empty' },
          powered: true,
          returnLevel: 1,
          limiterEnabled: true
        }
      })
    }, null, 2) + '\n'
  }

  var MOCK_PROJECT_FILES = {
    'club-night.mixjam': makeProject('club-night', 138),
    'archive/sunrise.mixjam': makeProject('sunrise', 104)
  }
  window.__mixjamProjectFiles = MOCK_PROJECT_FILES

  window.backendAPI = {
    getVersion: function () { return Promise.resolve('v0.test.0') },
    resizeToPlayer: function () { return Promise.resolve() },
    resizeToHome: function () { return Promise.resolve() },
    openExternal: function () { return Promise.resolve() },
    loadFolderSelections: function () { return Promise.resolve(MOCK_FOLDER_SELECTIONS) },
    saveFolderSelections: function () { return Promise.resolve() },
    loadMixJamFiles: function () { return Promise.resolve(MOCK_MIXJAM_FILES) },
    recordRecentProject: function () { return Promise.resolve() },
    openMixJamFile: function () {
      return Promise.resolve({ path: 'club-night.mixjam', contents: MOCK_PROJECT_FILES['club-night.mixjam'] })
    },
    readMixJamFile: function (_folder, path) {
      if (!MOCK_PROJECT_FILES[path]) return Promise.reject(new Error('Project fixture not found: ' + path))
      return Promise.resolve({ path: path, contents: MOCK_PROJECT_FILES[path] })
    },
    saveMixJamFileAs: function (_folder, _suggestedName, contents) {
      var path = 'saved-project.mixjam'
      MOCK_PROJECT_FILES[path] = contents
      if (!MOCK_MIXJAM_FILES.some(function (item) { return item.path === path })) {
        MOCK_MIXJAM_FILES.unshift({ path: path, displayName: 'saved-project', lastOpened: new Date().toISOString() })
      }
      return Promise.resolve({ path: path, contents: contents })
    },
    createGeneratedMixJamFile: function (_folder, basename, contents) {
      var path = basename + '-001.mixjam'
      MOCK_PROJECT_FILES[path] = contents
      MOCK_MIXJAM_FILES.unshift({ path: path, displayName: basename + '-001', lastOpened: new Date().toISOString() })
      return Promise.resolve({ path: path, contents: contents })
    },
    writeMixJamFile: function (_folder, path, contents) {
      MOCK_PROJECT_FILES[path] = contents
      return Promise.resolve()
    },
    findMissingSampleFiles: function (_folder, relpaths) {
      var existing = MOCK_SAMPLES.map(function (sample) { return sample.relpath })
      return Promise.resolve(relpaths.filter(function (path) { return existing.indexOf(path) === -1 }))
    },
    pickFolder: function () { return Promise.resolve(null) },
    validateFolder: function () { return Promise.resolve('ok') },
    requestFolderAccess: function () { return Promise.resolve(true) },
    getLibraryRootState: function (folder) {
      return Promise.resolve({
        rootKey: folder.id,
        lastCompletedAt: 1,
        hasUsableIndex: true
      })
    },
    listMissingRelpaths: function () { return Promise.resolve([]) },
    startLibrarySync: function () {
      return Promise.resolve({ identity: MOCK_LIBRARY_JOB, disposition: 'suppressed' })
    },
    cancelLibrarySync: function () { return Promise.resolve() },
    getScanProgress: function () {
      return Promise.resolve({
        identity: null,
        status: 'idle',
        phase: null,
        found: 0,
        processed: 0,
        total: 0
      })
    },
    getAnalysisProgress: function () {
      return Promise.resolve({
        identity: null,
        status: 'idle',
        analyzed: 0,
        total: 0
      })
    },
    querySamples: function (req) { return Promise.resolve(querySamples(req)) },
    getGeneratorReadiness: function () {
      return Promise.resolve({
        status: 'ready',
        analysisState: 'resolved',
        detectedBpm: 120,
        eligibleSamples: MOCK_SAMPLES.length,
        tempoClusters: [{
          relpathPrefix: '',
          sampleCount: MOCK_SAMPLES.length,
          bpm: 120,
          musicalKey: 'Am',
          confidence: 1
        }]
      })
    },
    planMixJam: function (folder, jobId, parameters) {
      var identity = { rootKey: folder.id, jobId: jobId }
      emit(generatorProgressListeners, { identity: identity, status: 'running', phase: 'shortlisting', completed: 5, total: 5 })
      emit(generatorProgressListeners, { identity: identity, status: 'running', phase: 'analyzing', completed: 5, total: 5 })
      emit(generatorProgressListeners, { identity: identity, status: 'running', phase: 'arranging', completed: 5, total: 5 })
      return Promise.resolve(generatorPlan(parameters))
    },
    cancelMixJamPlanning: function () { return Promise.resolve() },
    getGeneratorProgress: function () {
      return Promise.resolve({
        identity: null, status: 'idle', phase: null, completed: 0, total: 0
      })
    },
    listTags: function (rootKey) { return Promise.resolve(MOCK_TAGS.slice().sort(function (a, b) { return a.name.localeCompare(b.name) })) },
    createTag: function (name, color, rootKey) {
      var trimmed = name.trim()
      var existing = MOCK_TAGS.find(function (tag) { return tag.name.toLowerCase() === trimmed.toLowerCase() })
      if (existing) {
        // Promoting a folder tag makes it user-owned but still folder-derived.
        if (existing.origin === 'folder') existing.origin = 'shared'
        if (color !== undefined) existing.color = color
        return Promise.resolve(existing)
      }
      var tag = { id: nextTagId++, name: trimmed, color: color || null, origin: 'user', folderDerived: false }
      MOCK_TAGS.push(tag)
      return Promise.resolve(tag)
    },
    renameTag: function (id, name) {
      var tag = MOCK_TAGS.find(function (item) { return item.id === id })
      if (tag && tag.origin !== 'user') {
        return Promise.reject(new Error('Folder-derived tag names are managed automatically.'))
      }
      if (tag) {
        var oldName = tag.name
        tag.name = name.trim()
        MOCK_SAMPLES.forEach(function (sample) {
          if (sample.tagIds.indexOf(id) !== -1) {
            sample.tags = sample.tags.map(function (value) { return value === oldName ? tag.name : value }).sort()
          }
        })
      }
      return Promise.resolve()
    },
    setTagColor: function (id, color) {
      var tag = MOCK_TAGS.find(function (item) { return item.id === id })
      if (tag) tag.color = color
      return Promise.resolve()
    },
    deleteTag: function (id) {
      var tag = MOCK_TAGS.find(function (item) { return item.id === id })
      if (!tag) return Promise.resolve()
      if (tag.origin === 'folder') {
        return Promise.reject(new Error('Folder-only tags are managed automatically and cannot be edited.'))
      }
      if (tag.origin === 'shared') {
        tag.origin = 'folder'
        tag.color = null
      } else {
        MOCK_TAGS = MOCK_TAGS.filter(function (item) { return item.id !== id })
      }
      MOCK_SAMPLES.forEach(function (sample) {
        sample.userTagIds = sample.userTagIds.filter(function (tagId) { return tagId !== id })
        if (sample.folderTagIds.indexOf(id) === -1) {
          sample.tagIds = sample.tagIds.filter(function (tagId) { return tagId !== id })
          sample.tags = sample.tags.filter(function (name) { return name !== tag.name })
        }
      })
      return Promise.resolve()
    },
    assignTag: function (sampleId, tagId) {
      var sample = MOCK_SAMPLES.find(function (row) { return row.id === sampleId })
      var tag = MOCK_TAGS.find(function (item) { return item.id === tagId })
      if (sample && tag && tag.origin !== 'folder' && sample.userTagIds.indexOf(tagId) === -1) {
        sample.userTagIds.push(tagId)
        sample.userTagIds.sort(function (a, b) { return a - b })
        if (sample.tagIds.indexOf(tagId) === -1) {
          sample.tagIds.push(tagId)
          sample.tagIds.sort(function (a, b) { return a - b })
          sample.tags.push(tag.name)
          sample.tags.sort()
        }
      }
      return Promise.resolve()
    },
    unassignTag: function (sampleId, tagId) {
      var sample = MOCK_SAMPLES.find(function (row) { return row.id === sampleId })
      var tag = MOCK_TAGS.find(function (item) { return item.id === tagId })
      if (sample && tag) {
        sample.userTagIds = sample.userTagIds.filter(function (id) { return id !== tagId })
        if (sample.folderTagIds.indexOf(tagId) === -1) {
          sample.tagIds = sample.tagIds.filter(function (id) { return id !== tagId })
          sample.tags = sample.tags.filter(function (name) { return name !== tag.name })
        }
      }
      return Promise.resolve()
    },
    updateSampleAnalysis: function (sampleId, patch) {
      var sample = MOCK_SAMPLES.find(function (row) { return row.id === sampleId })
      if (sample) {
        if (Object.prototype.hasOwnProperty.call(patch, 'bpm')) { sample.bpm = patch.bpm; sample.bpmSource = patch.bpm === null ? null : 'manual' }
        if (Object.prototype.hasOwnProperty.call(patch, 'musicalKey')) { sample.musicalKey = patch.musicalKey; sample.musicalKeySource = patch.musicalKey === null ? null : 'manual' }
        if (Object.prototype.hasOwnProperty.call(patch, 'sampleType')) { sample.sampleType = patch.sampleType; sample.sampleTypeSource = patch.sampleType === null ? null : 'manual' }
      }
      return Promise.resolve()
    },
    reanalyzeSample: function () { return Promise.resolve() },
    listLibraries: function () { return Promise.resolve([]) },
    saveLibrary: function (name, ruleJson) { return Promise.resolve({ id: 1, name: name, createdAt: Date.now(), ruleJson: ruleJson }) },
    deleteLibrary: function () { return Promise.resolve() },
    readSampleBytes: function () { return Promise.resolve(mockWavBytes()) },
    onScanProgress: function (listener) { return subscribe(scanProgressListeners, listener) },
    onScanDone: function (listener) { return subscribe(scanDoneListeners, listener) },
    onAnalysisProgress: function (listener) { return subscribe(analysisProgressListeners, listener) },
    onAnalysisDone: function (listener) { return subscribe(analysisDoneListeners, listener) },
    onGeneratorProgress: function (listener) { return subscribe(generatorProgressListeners, listener) }
  }
})()
