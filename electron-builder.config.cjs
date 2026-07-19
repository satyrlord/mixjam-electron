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
    category: 'Audio',
    icon: 'public/app-icon.svg'
  },
  win: {
    target: ['portable'],
    icon: 'public/app-icon.ico'
  },
  mac: {
    target: ['dmg'],
    icon: 'public/app-icon.svg'
  },
  npmRebuild: false,
  extraMetadata: {
    main: 'out/main/index.js'
  }
}
