console.log("Ah wait. `a81f2dc` added `enforceMinimumContentSize(window)` to the outer block. And in the code I just read:");
console.log(`
export function resizeWindowToHome(window: WindowFrameControls): void {
  const wasMaximized = window.isMaximized?.() ?? false
  const deferOperationsUntilUnmaximized = wasMaximized && Boolean(window.once)
  if (deferOperationsUntilUnmaximized) {
    // ...
    window.once?.('unmaximize', () => {
      queueMicrotask(() => applyHomeSize(window))
    })
    window.unmaximize?.()
...`);
