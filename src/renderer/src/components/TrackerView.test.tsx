import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TrackerView from './TrackerView'

describe('TrackerView', () => {
  it('renders the three placeholder zones', () => {
    render(<TrackerView />)
    expect(screen.getByText('Timeline Area')).toBeInTheDocument()
    expect(screen.getByText('Browser Panel')).toBeInTheDocument()
    expect(screen.getByText('Transport Strip')).toBeInTheDocument()
  })
})
