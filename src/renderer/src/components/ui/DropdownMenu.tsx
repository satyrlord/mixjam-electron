import { forwardRef } from 'react'
import * as Primitive from '@radix-ui/react-dropdown-menu'

export const DropdownMenuRoot = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger
export const DropdownMenuSeparator = Primitive.Separator

export const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(function DropdownMenuContent({ className = '', ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        ref={ref}
        className={`mixjam-menu-content ${className}`.trim()}
        sideOffset={4}
        collisionPadding={8}
        {...props}
      />
    </Primitive.Portal>
  )
})

export const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof Primitive.Item>,
  React.ComponentPropsWithoutRef<typeof Primitive.Item>
>(function DropdownMenuItem({ className = '', ...props }, ref) {
  return <Primitive.Item ref={ref} className={`mixjam-menu-item ${className}`.trim()} {...props} />
})
