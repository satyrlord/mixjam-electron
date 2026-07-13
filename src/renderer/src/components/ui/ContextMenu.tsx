import { forwardRef } from 'react'
import * as Primitive from '@radix-ui/react-context-menu'

export const ContextMenuRoot = Primitive.Root
export const ContextMenuTrigger = Primitive.Trigger

export const ContextMenuContent = forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(function ContextMenuContent({ className = '', ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        ref={ref}
        className={`mixjam-menu-content ${className}`.trim()}
        collisionPadding={8}
        {...props}
      />
    </Primitive.Portal>
  )
})

export const ContextMenuItem = forwardRef<
  React.ElementRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item>
>(function ContextMenuItem({ className = '', ...props }, ref) {
  return <Primitive.Item ref={ref} className={`mixjam-menu-item ${className}`.trim()} {...props} />
})

export const ContextMenuCheckboxItem = forwardRef<
  React.ElementRef<typeof Primitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Primitive.CheckboxItem>
>(function ContextMenuCheckboxItem({ className = '', children, ...props }, ref) {
  return (
    <Primitive.CheckboxItem
      ref={ref}
      className={`mixjam-menu-item ${className}`.trim()}
      {...props}
    >
      <Primitive.ItemIndicator className="mixjam-menu-indicator" aria-hidden="true" />
      {children}
    </Primitive.CheckboxItem>
  )
})

export const ContextMenuLabel = Primitive.Label
