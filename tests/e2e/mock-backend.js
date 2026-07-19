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
    { path: 'sketches/deep-water.mixjam', displayName: 'deep-water', lastOpened: null },
    { path: 'archive/warehouse.mixjam', displayName: 'warehouse', lastOpened: null },
    { path: 'ideas/low-tide.mixjam', displayName: 'low-tide', lastOpened: null },
    { path: 'sketches/blue-hour.mixjam', displayName: 'blue-hour', lastOpened: null },
    { path: 'archive/slow-motion.mixjam', displayName: 'slow-motion', lastOpened: null }
  ]

  var MOCK_SAMPLES = [
    { id: 1, relpath: 'Drums/Kicks/kick_808.wav', filename: 'kick_808.wav', ext: 'wav', sizeBytes: 1024, duration: 0.5, sampleRate: 44100, channels: 1, bpm: 120, bpmSource: 'analysis', musicalKey: 'C', musicalKeySource: 'analysis', sampleType: 'Kick', sampleTypeSource: 'analysis', dateAdded: 1000, scanState: 1, categoryId: 2, tagIds: [], tags: [] },
    { id: 2, relpath: 'Drums/Snares/snare_clap.wav', filename: 'snare_clap.wav', ext: 'wav', sizeBytes: 2048, duration: 0.3, sampleRate: 44100, channels: 1, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: 'Snare', sampleTypeSource: 'analysis', dateAdded: 1001, scanState: 1, categoryId: 2, tagIds: [], tags: [] },
    { id: 3, relpath: 'Bass/deep_sub.wav', filename: 'deep_sub.wav', ext: 'wav', sizeBytes: 4096, duration: 1.2, sampleRate: 44100, channels: 1, bpm: null, bpmSource: null, musicalKey: 'C', musicalKeySource: 'analysis', sampleType: 'Bass', sampleTypeSource: 'analysis', dateAdded: 1002, scanState: 1, categoryId: 1, tagIds: [], tags: [] },
    { id: 4, relpath: 'Synth/pad_warm.wav', filename: 'pad_warm.wav', ext: 'wav', sizeBytes: 8192, duration: 2.0, sampleRate: 44100, channels: 2, bpm: 120, bpmSource: 'analysis', musicalKey: 'C', musicalKeySource: 'analysis', sampleType: 'Synth', sampleTypeSource: 'analysis', dateAdded: 1003, scanState: 1, categoryId: 4, tagIds: [], tags: [] },
    { id: 5, relpath: 'FX/riser_imp.wav', filename: 'riser_imp.wav', ext: 'wav', sizeBytes: 1536, duration: 0.8, sampleRate: 44100, channels: 1, bpm: null, bpmSource: null, musicalKey: null, musicalKeySource: null, sampleType: 'FX', sampleTypeSource: 'analysis', dateAdded: 1004, scanState: 1, categoryId: 3, tagIds: [1], tags: ['fav'] }
  ]

  var MOCK_CATEGORIES = [
    { id: 1, name: 'Bass', parentId: null },
    { id: 2, name: 'Drums', parentId: null },
    { id: 3, name: 'FX', parentId: null },
    { id: 4, name: 'Synth', parentId: null },
    { id: 5, name: 'Vocal', parentId: null },
    { id: 6, name: 'Loop', parentId: null },
    { id: 7, name: 'Percussion', parentId: null },
    { id: 8, name: 'Atmosphere', parentId: null },
    { id: 9, name: 'Unsorted', parentId: null }
  ]

  var MOCK_TAGS = [
    { id: 1, name: 'fav', color: '#ffcc00' }
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
    if (req.categoryId !== undefined) {
      rows = rows.filter(function (r) { return r.categoryId === req.categoryId })
    }
    if (req.tagIds && req.tagIds.length) {
      rows = rows.filter(function (r) {
        return req.tagIds.some(function (id) { return r.tagIds.indexOf(id) !== -1 })
      })
    }
    var total = rows.length
    var offset = req.offset || 0
    var limit = req.limit || 200
    return { rows: rows.slice(offset, offset + limit), total: total }
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
        placements: index === 0 ? [
          { id: 'generator-kick-start', sampleRef: MOCK_SAMPLES[0].relpath, sampleName: MOCK_SAMPLES[0].filename, startTick: 0, durationTicks: 8, durationSeconds: 0.5, nativeBpm: 120, slot: 0 },
          { id: 'generator-kick-end', sampleRef: MOCK_SAMPLES[0].relpath, sampleName: MOCK_SAMPLES[0].filename, startTick: targetTicks - 8, durationTicks: 8, durationSeconds: 0.5, nativeBpm: 120, slot: 0 }
        ] : []
      })
    }
    return {
      generatorVersion: 1,
      profileId: parameters.profileId,
      profileVersion: 2,
      seed: parameters.seed,
      parameters: { bpmMode: parameters.bpmMode, resolvedBpm: bpm, intensity: parameters.intensity, durationSeconds: parameters.durationSeconds },
      corpusFingerprint: 'e2e-fingerprint',
      sampleFolderKey: MOCK_FOLDER_SELECTIONS.sampleFolder.id,
      targetBars: bars,
      targetTicks: targetTicks,
      quantizedDurationSeconds: bars * 240 / bpm,
      dominantKey: 'C',
      analysis: { attemptedFiles: 5, analyzedFiles: 5, uniqueReads: 5 },
      selections: [{ laneIndex: 0, requestedType: 'Kick', selectedType: 'Kick', sampleRefs: [MOCK_SAMPLES[0].relpath] }],
      substitutions: [],
      sections: [{ name: 'Intro', startBar: 0, endBar: bars, activeLanes: [0] }],
      phrases: [{ sectionIndex: 0, startBar: 0, endBar: Math.min(8, bars), activeLanes: [0], motif: 'A' }],
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
          sampleRef: 'Drums/Kicks/kick_808.wav',
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
      formatVersion: 4,
      appVersion: 'v0.test.0',
      createdAt: '2026-06-28T12:00:00.000Z',
      modifiedAt: '2026-06-28T12:00:00.000Z',
      song: { bpm: bpm, masterGain: 0.7, clipEdgeMicroFades: { enabled: true, fadeInMs: 2, fadeOutMs: 4 } },
      lanes: lanes,
      fxBuses: [1, 2, 3, 4].map(function (slot) {
        return {
          id: 'fx-' + slot,
          index: slot - 1,
          name: 'FX' + slot,
          module: slot === 1
            ? { type: 'delay', mode: 'free', timeMs: 375, noteDivision: '1/8', feedback: 35, tapeDistortion: 0, pingPong: false }
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
    startUniformFolderCalibration: function (folder) {
      return Promise.resolve({ rootKey: folder.id, jobId: 'e2e-calibration-job' })
    },
    cancelUniformFolderCalibration: function () { return Promise.resolve() },
    getCalibrationProgress: function () {
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
    getGeneratorProgress: function () { return Promise.resolve({ identity: null, status: 'idle', phase: null, completed: 0, total: 0 }) },
    listTags: function () { return Promise.resolve(MOCK_TAGS) },
    createTag: function (name, color) { return Promise.resolve({ id: 99, name: name, color: color || null }) },
    renameTag: function () { return Promise.resolve() },
    setTagColor: function (id, color) {
      var tag = MOCK_TAGS.find(function (item) { return item.id === id })
      if (tag) tag.color = color
      return Promise.resolve()
    },
    deleteTag: function () { return Promise.resolve() },
    assignTag: function () { return Promise.resolve() },
    unassignTag: function () { return Promise.resolve() },
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
    listCategories: function () { return Promise.resolve(MOCK_CATEGORIES) },
    createCategory: function (name) { return Promise.resolve({ id: 99, name: name, parentId: null }) },
    deleteCategory: function () { return Promise.resolve() },
    listLibraries: function () { return Promise.resolve([]) },
    saveLibrary: function (name, ruleJson) { return Promise.resolve({ id: 1, name: name, createdAt: Date.now(), ruleJson: ruleJson }) },
    deleteLibrary: function () { return Promise.resolve() },
    readSampleBytes: function () { return Promise.resolve(mockWavBytes()) },
    onScanProgress: function (listener) { return subscribe(scanProgressListeners, listener) },
    onScanDone: function (listener) { return subscribe(scanDoneListeners, listener) },
    onAnalysisProgress: function (listener) { return subscribe(analysisProgressListeners, listener) },
    onAnalysisDone: function (listener) { return subscribe(analysisDoneListeners, listener) },
    onCalibrationProgress: function () { return function () {} },
    onCalibrationDone: function () { return function () {} },
    onGeneratorProgress: function (listener) { return subscribe(generatorProgressListeners, listener) }
  }
})()
