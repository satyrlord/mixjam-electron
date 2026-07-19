import { useEffect } from 'react'

interface MediaSessionControls {
  transportPlay: () => void
  transportPause: () => void
  transportSkipBack: () => void
  transportJumpToEnd: () => void
}

export function useMediaSessionControls({
  transportPlay,
  transportPause,
  transportSkipBack,
  transportJumpToEnd
}: MediaSessionControls): void {
  useEffect(() => {
    const mediaSession = navigator.mediaSession
    if (!mediaSession) return
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => { transportPlay() },
      pause: () => { transportPause() },
      previoustrack: () => { transportSkipBack() },
      nexttrack: () => { transportJumpToEnd() }
    }
    for (const [action, handler] of Object.entries(handlers)) {
      try { mediaSession.setActionHandler(action as MediaSessionAction, handler) } catch { /* unsupported action */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { mediaSession.setActionHandler(action as MediaSessionAction, null) } catch { /* unsupported action */ }
      }
    }
  }, [transportJumpToEnd, transportPause, transportPlay, transportSkipBack])
}
