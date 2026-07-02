import { useCallback, useEffect, useRef, useState } from 'react'

interface UseBpmEditorOptions {
  bpm: number
  onSetBpm: (bpm: number) => void
}

interface UseBpmEditorResult {
  editingBpm: boolean
  bpmDraft: string
  bpmInputRef: React.RefObject<HTMLInputElement | null>
  setBpmDraft: React.Dispatch<React.SetStateAction<string>>
  handleBpmEditStart: () => void
  handleBpmEditCommit: () => void
  handleBpmEditKeyDown: (e: React.KeyboardEvent) => void
}

/**
 * Inline BPM editing state for the Middle Strip. Handles start (click to edit),
 * commit (Enter or blur, clamped 50-200), and cancel (Escape) for the BPM
 * display/editor. Extracted from TrackerView to keep that component under 1k
 * lines.
 */
export function useBpmEditor({ bpm, onSetBpm }: UseBpmEditorOptions): UseBpmEditorResult {
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState(String(bpm))
  const bpmInputRef = useRef<HTMLInputElement>(null)

  const handleBpmEditStart = useCallback(() => {
    setBpmDraft(String(bpm))
    setEditingBpm(true)
  }, [bpm])

  const handleBpmEditCommit = useCallback(() => {
    const parsed = parseInt(bpmDraft, 10)
    if (!Number.isNaN(parsed) && parsed >= 50 && parsed <= 200) {
      onSetBpm(parsed)
    }
    setEditingBpm(false)
  }, [bpmDraft, onSetBpm])

  const handleBpmEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBpmEditCommit()
    if (e.key === 'Escape') setEditingBpm(false)
  }, [handleBpmEditCommit])

  useEffect(() => {
    if (editingBpm && bpmInputRef.current) {
      bpmInputRef.current.focus()
      bpmInputRef.current.select()
    }
  }, [editingBpm])

  return {
    editingBpm,
    bpmDraft,
    bpmInputRef,
    setBpmDraft,
    handleBpmEditStart,
    handleBpmEditCommit,
    handleBpmEditKeyDown
  }
}
