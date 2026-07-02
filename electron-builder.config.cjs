const { resolve } = require('node:path')

module.exports = {
  appId: 'com.mixjam.electron',
  productName: 'MixJam Electron',
  directories: {
    output: 'dist-electron'
  },
  files: [
    'out/**',
    'package.json',
    'public/**',
    'node_modules/**'
  ],
  asar: true,
  linux: {
    target: ['AppImage'],
    category: 'Audio'
  },
  win: {
    target: ['portable']
  },
  mac: {
    target: ['dmg']
  },
  npmRebuild: false,
  extraMetadata: {
    main: 'out/main/index.js'
  },
  afterSign: undefined
}
