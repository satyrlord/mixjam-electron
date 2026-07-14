// E2E mock BackendAPI — bundled as a plain .js file and inlined into the
// Playwright browser context via addInitScript at test time.
//
// Must be plain ES5-compatible JavaScript (no imports, no TypeScript,
// no arrow functions in object methods where `this` matters).
// Structured-clone cannot serialize functions, so the entire mock must
// be a string that executes in the browser context.
// This is the SOURCE file; tests/e2e/fixtures.ts reads and inlines it.
// Keep the IIFE wrapper so variables stay local.
(function () {
  var MOCK_FOLDER_SELECTIONS = {
    userFolder: { id: 'e2e-user-folder', name: 'MixJam' },
    sampleFolder: { id: 'e2e-sample-folder', name: 'Samples' }
  }

  var MOCK_MIXJAM_FILES = [
    { path: 'club-night.mixjam', displayName: 'club-night', lastOpened: '2026-06-28T12:00:00.000Z' },
    { path: 'archive/sunrise.mixjam', displayName: 'sunrise', lastOpened: null }
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

  function makeProject(name, bpm) {
    var lanes = []
    var channels = []
    for (var i = 0; i < 16; i += 1) {
      lanes.push({
        index: i,
        name: 'Lane ' + (i + 1),
        muted: false,
        solo: false,
        pan: 0,
        channelId: 'ch-' + (i + 1),
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
      channels.push({
        id: 'ch-' + (i + 1),
        index: i,
        name: 'Channel ' + (i + 1),
        gain: i === 0 ? 0.64 : 0.8,
        pan: 0,
        muted: false,
        solo: false,
        fx: i === 0 ? [{
          id: 'fx-' + name,
          type: 'delay',
          bypassed: false,
          timeMs: 375,
          feedback: 0.35,
          mix: 0.3,
          pingPong: false,
          tempoSync: false,
          noteDivision: '1/8'
        }] : []
      })
    }
    return JSON.stringify({
      formatVersion: 1,
      appVersion: 'v0.test.0',
      createdAt: '2026-06-28T12:00:00.000Z',
      modifiedAt: '2026-06-28T12:00:00.000Z',
      song: { bpm: bpm, masterGain: 0.7 },
      lanes: lanes,
      channels: channels
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
    hasSamples: function () { return Promise.resolve(true) },
    listMissingRelpaths: function () { return Promise.resolve([]) },
    startScan: function () { return Promise.resolve() },
    cancelScan: function () { return Promise.resolve() },
    getScanProgress: function () { return Promise.resolve({ status: 'idle', phase: null, found: 0, processed: 0, total: 0 }) },
    getAnalysisProgress: function () { return Promise.resolve({ status: 'idle', analyzed: 0, total: 0 }) },
    querySamples: function (req) { return Promise.resolve(querySamples(req)) },
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
    readSampleBytes: function () { return Promise.resolve(null) },
    onScanProgress: function () { return function () {} },
    onScanDone: function () { return function () {} },
    onAnalysisProgress: function () { return function () {} },
    onAnalysisDone: function () { return function () {} }
  }
})()
