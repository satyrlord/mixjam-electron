console.log("Wait, the test snapshot expects unmaximize, but what if `returnedHome` captures the intermediate un-centered snapshot, and THEN the poll happens, but it doesn't poll because the intermediate un-centered snapshot was already passed? Actually, `await expect.poll(async () => centered(await snapshot())).toBe(true)` is polling `snapshot()`. So it WILL keep checking.");

console.log("If it keeps checking `snapshot()`, but `center()` is never called, or it's overwritten by SC_RESTORE after `queueMicrotask`...");
console.log("Wait, `queueMicrotask` fires too early. Let's see.");
