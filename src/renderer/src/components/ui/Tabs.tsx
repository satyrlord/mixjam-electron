import { createContext, forwardRef, useContext, type KeyboardEvent } from 'react'
import * as Primitive from '@radix-ui/react-tabs'

interface TabsContextValue {
  value: string | undefined
  onValueChange: ((value: string) => void) | undefined
}

const TabsContext = createContext<TabsContextValue>({ value: undefined, onValueChange: undefined })

export function TabsRoot({ value, onValueChange, ...props }: React.ComponentPropsWithoutRef<typeof Primitive.Root>) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <Primitive.Root value={value} onValueChange={onValueChange} {...props} />
    </TabsContext.Provider>
  )
}

export const TabsList = Primitive.List
export const TabsContent = Primitive.Content

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof Primitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof Primitive.Trigger>
>(function TabsTrigger({ value, onKeyDown, ...props }, ref) {
  const tabs = useContext(TabsContext)
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    const list = event.currentTarget.closest('[role="tablist"]')
    const triggers = list ? Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : []
    const currentIndex = triggers.indexOf(event.currentTarget)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % triggers.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + triggers.length) % triggers.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = triggers.length - 1
    if (nextIndex === null || triggers.length === 0) return
    event.preventDefault()
    const next = triggers[nextIndex]
    next.focus()
    const nextValue = next.dataset.tabsValue
    if (nextValue) tabs.onValueChange?.(nextValue)
  }

  return (
    <Primitive.Trigger
      ref={ref}
      value={value}
      data-tabs-value={value}
      tabIndex={tabs.value === value ? 0 : -1}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
})
