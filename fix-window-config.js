import fs from 'fs';
let content = fs.readFileSync('src/shared/window-config.ts', 'utf8');

// The issue is that `queueMicrotask` fires too early on Windows. The native `SC_RESTORE` bounds settling 
// happens asynchronously on the native event loop after the `unmaximize` event is fired.
// To fix this race condition reliably without arbitrary `setTimeout`s, we can listen to the `resized` event
// or just use a small `setTimeout` because there is no explicit `restore-complete` event in Electron.
// Wait, actually, can we just use setTimeout(..., 50)?
