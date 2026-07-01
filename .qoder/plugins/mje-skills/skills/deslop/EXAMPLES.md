# Deslop Examples

Before/after pairs to calibrate what "slop" looks like in MixJam code.

## Example 1 — Comment Slop

### 1. Before (slop)

```ts
// Import the track store hook from the state layer
import { useTrackStore } from "../../state/trackStore";

// Define the TrackLane component
// This component renders a single track lane in the tracker grid
export function TrackLane({ laneId, index }: TrackLaneProps) {
  // Get the track data from the store using the laneId
  // We use a selector to avoid unnecessary re-renders
  const track = useTrackStore((s) => s.tracks[laneId]);

  // If the track doesn't exist, render nothing
  // This can happen during initial load or when a track is deleted
  if (!track) {
    // Return null to render nothing
    return null;
  }

  // Calculate the lane height based on the index
  // Each lane is 32px tall with a 1px gap
  const top = index * 33;

  // Render the lane container with absolute positioning
  return (
    <div
      className="tracker-lane"
      style={{ top: `${top}px` }}
      data-lane-id={laneId}
    >
      {/* Render the track name */}
      <span className="lane-name">{track.name}</span>
    </div>
  );
}
```

### 1. After (deslopped)

```ts
import { useTrackStore } from "../../state/trackStore";

export function TrackLane({ laneId, index }: TrackLaneProps) {
  const track = useTrackStore((s) => s.tracks[laneId]);

  if (!track) return null;

  return (
    <div
      className="tracker-lane"
      style={{ top: `${index * 33}px` }}
      data-lane-id={laneId}
    >
      <span className="lane-name">{track.name}</span>
    </div>
  );
}
```

**What was removed:** restatement comments ("Define the TrackLane component"),
obvious explanations ("Return null to render nothing"), and redundant
line-by-line narration. **What was kept:** nothing — no comment in the
"before" version carried a non-obvious invariant or decision.

---

## Example 2 — Defensive Cruft Slop

### 2. Before (slop)

```ts
async function loadSample(url: string): Promise<AudioBuffer | null> {
  try {
    // Validate the URL before attempting to fetch
    if (!url || url.trim() === "") {
      console.warn("loadSample called with empty URL");
      return null;
    }

    // Check if the URL is valid
    try {
      new URL(url);
    } catch {
      console.warn("loadSample called with invalid URL:", url);
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.warn("loadSample fetch failed:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.warn("loadSample received empty buffer");
      return null;
    }

    const audioContext = getAudioContext();
    if (!audioContext) {
      console.warn("loadSample: no AudioContext available");
      return null;
    }

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch (error) {
    // Log any unexpected errors
    console.error("loadSample error:", error);
    return null;
  }
}
```

### 2. After (deslopped)

```ts
async function loadSample(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load sample: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioContext = getAudioContext();

  return audioContext.decodeAudioData(arrayBuffer);
}
```

**What was removed:** the entire try/catch that silently swallowed errors
(audio engine errors should propagate to the bridge, not be silenced), URL
validation that duplicates the browser's built-in fetch error, null-guard
cascades that paper over invariants (if `getAudioContext()` can return null,
that's the caller's problem to surface, not this function's to silently
absorb), and a comment that restates the function call on the next line.

**What was kept:** the HTTP status check — that's a real business rule, not
defensive cruft.
