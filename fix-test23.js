console.log("Actually wait! We don't have to `setTimeout`. Let's use `setTimeout(() => applyHomeSize(window), 50)`.");
console.log("Is 50ms resilient enough? If the Windows box is heavily loaded, 50ms might not be enough. Is there a way to poll until unmaximized?");
console.log("Well, the Playwright poll checks `snapshot()`, which actually polls native window bounds! If we wait 50ms and center, what if `SC_RESTORE` takes 100ms? Then `center()` runs, but `SC_RESTORE` completes later and resets bounds to the un-centered position! So `center()` gets overwritten.");
