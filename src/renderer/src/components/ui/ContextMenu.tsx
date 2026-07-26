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
