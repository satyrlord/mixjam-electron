import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DialogContent, DialogRoot, DialogTitle } from './Dialog'
import { TabsList, TabsRoot, TabsTrigger } from './Tabs'

describe('Dialog primitives', () => {
  it('applies caller classes and reports direct overlay interaction', () => {
    const onOverlayClick = vi.fn()
    render(
      <DialogRoot open>
        <DialogContent className="extra" onOverlayClick={onOverlayClick}>
          <DialogTitle>Dialog title</DialogTitle>
        </DialogContent>
      </DialogRoot>
    )

    expect(screen.getByRole('dialog')).toHaveClass('mixjam-dialog-content', 'extra')
    const overlay = document.querySelector('.mixjam-dialog-overlay')!
    fireEvent.pointerDown(overlay)
    expect(onOverlayClick).toHaveBeenCalledTimes(1)
    const nestedTarget = document.createElement('span')
    overlay.append(nestedTarget)
    fireEvent.pointerDown(nestedTarget)
    expect(onOverlayClick).toHaveBeenCalledTimes(1)
  })

  it('uses the base content class when no optional props are supplied', () => {
    render(
      <DialogRoot open>
        <DialogContent>
          <DialogTitle>Plain dialog</DialogTitle>
        </DialogContent>
      </DialogRoot>
    )

    expect(screen.getByRole('dialog')).toHaveClass('mixjam-dialog-content')
    fireEvent.pointerDown(document.querySelector('.mixjam-dialog-overlay')!)
  })
})

describe('Tabs primitives', () => {
  it('supports the full explicit keyboard navigation policy', () => {
    const onValueChange = vi.fn()
    render(
      <TabsRoot value="middle" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="middle">Middle</TabsTrigger>
          <TabsTrigger value="last">Last</TabsTrigger>
        </TabsList>
      </TabsRoot>
    )

    const first = screen.getByRole('tab', { name: 'First' })
    const middle = screen.getByRole('tab', { name: 'Middle' })
    const last = screen.getByRole('tab', { name: 'Last' })
    expect(middle).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(middle, { key: 'ArrowRight' })
    expect(last).toHaveFocus()
    expect(onValueChange).toHaveBeenLastCalledWith('last')

    fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Home' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'End' })
    expect(last).toHaveFocus()
  })

  it('respects a caller that prevents keyboard handling', () => {
    const onValueChange = vi.fn()
    render(
      <TabsRoot value="first" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="first" onKeyDown={(event) => event.preventDefault()}>First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
      </TabsRoot>
    )

    fireEvent.keyDown(screen.getByRole('tab', { name: 'First' }), { key: 'ArrowRight' })
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
