console.log("The test checks that re-centers after an asynchronous unmaximize using queueMicrotask.");
console.log("Wait, if I change queueMicrotask to setTimeout, it will break the test, but I can easily fix it.");
console.log("Why doesn't `queueMicrotask` work on Windows? Because the `unmaximize` event is fired BEFORE the window actually finishes unmaximizing natively. SC_RESTORE hasn't fully updated the bounds. So we just need a delay.");
console.log("Delaying by 50ms should be enough. Let's make it 50ms.");
