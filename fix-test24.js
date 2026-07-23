console.log("Actually wait! We DO have `unmaximize` event. What other events does Electron BrowserWindow have?");
console.log("It has `resized`, `moved`, `restore`, `ready-to-show`. `unmaximize` is explicitly emitted. In Electron, `unmaximize` is emitted when the window is unmaximized.");
console.log("What if we use a longer timeout like 100ms or 200ms? It shouldn't hurt since it's just the UI settling, and 200ms isn't very long for returning to home.");
