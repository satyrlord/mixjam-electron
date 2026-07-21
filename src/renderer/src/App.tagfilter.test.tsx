import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Mock useAppState so that tags and selectedTagIds are pre-populated with a
// real useState setter. This ensures handleToggleTagFilter's updater function
// body is actually executed by React, not just recorded as a mock call.
vi.mock('./hooks/useAppState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./hooks/useAppState')>()
  return {
    ...actual,
    useAppState: (...args: Parameters<typeof actual.useAppState>) => {
      const result = actual.useAppState(...args)
      const [selectedTagIds, setSelectedTagIds] = useState<number[]>([5])
      return {
        ...result,
        tags: [{ id: 5, name: 'Cool', color: '#f00' }],
        selectedTagIds,
        setSelectedTagIds
      }
    }
  }
})

import App from './App'

describe('App tag filter', () => {
  it('toggles tag filter when tag chip is clicked', async () => {
    render(<App />)

    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Start New MixJam' })
    ).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start New MixJam' }))

    await waitFor(() => {
      expect(screen.getAllByText('Lane 1').length).toBeGreaterThan(0)
    })

    const chip = screen.getByText(/Cool/)
    fireEvent.click(chip.closest('button')!)
    fireEvent.click(chip.closest('button')!)
  })
})
