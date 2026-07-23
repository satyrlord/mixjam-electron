console.log("Ah, wait! So on Linux WITH openbox it works. BUT the job log for Windows showed:");
console.log("Error: expect(received).toBe(expected) // Object.is equality");
console.log("Expected: true");
console.log("Received: false");
console.log("Call Log: - Timeout 5000ms exceeded while waiting on the predicate");
console.log("168 |       expect(returnedHome.bounds.height).toBeGreaterThanOrEqual(1080)");
console.log("169 |       expect(returnedHome.contentBounds).toMatchObject({ width: 1920, height: 1080 })");
console.log("170 |       await expect.poll(async () => centered(await snapshot())).toBe(true)");
