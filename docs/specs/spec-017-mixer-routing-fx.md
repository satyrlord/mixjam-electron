# Spec 017 — Mixer Channel Routing, Management & Per-Channel FX

**Spec Validation Status:** NOT VALIDATED
**Spec Implementation Status:** NOT IMPLEMENTED
**Depends on:** spec-007 (Mixer), spec-010 (Per-Channel Audio Effects)

## Objective

Implement features deferred from spec-007:

1. User-facing lane-to-channel routing assignment (currently hardcoded 1:1).
2. Add-channel beyond 16, with the supported upper limit decided during
   validation rather than inherited from an unenforced engine assumption.
3. Drag-to-reorder channels in the mixer.
4. Per-channel audio effects (delay, reverb, compression, EQ) — elaboration
   depends on spec-010.

## Scope (draft — needs full elaboration)

### Routing UI

- Each lane head shows current channel assignment (e.g., clickable "Ch N").
- User can reassign a lane to any existing channel via a dropdown/popup.
- Multiple lanes can share one channel.
- Visual indicator when multiple lanes route to the same channel.
- AC-010 from spec-007 (multiple lanes → one channel mute behavior) is
  validated here.

### Channel Management

- **Add channel:** Button or "+" control in the mixer column footer. Validation
  must set and justify the supported channel limit before implementation. New
  channels start with default gain=1, pan=0. User assigns lanes to new channels
  via the routing UI.
- **Drag-to-reorder channels:** Drag a channel strip to a new position in the
  mixer. Lane-to-channel mappings follow channel identity (not position), so
  reordering is a visual-only change for the mixer layout.

### Per-Channel FX

Spec-010 defines the validated effects contract but is not implemented. This
spec must elaborate how that contract integrates with channel routing before
implementation. Expected scope:

- Per-channel insert effects (delay, reverb, compression, EQ).
- FX chain UI within or adjacent to the channel strip.
- Stereo width DSP (control added to channel strip when DSP is ready).

## Non-Goals

- No channel group/link.
- No send/return or aux buses.
- No automation.

## References

- spec-007 (Mixer) — hardcoded 1:1 routing, cap at 16, no reordering
- [spec-010](spec-010-audio-effects.md) — validated per-channel effects contract
