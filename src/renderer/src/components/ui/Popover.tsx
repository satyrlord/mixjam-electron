import { forwardRef } from 'react'
import * as Primitive from '@radix-ui/react-popover'

export const PopoverRoot = Primitive.Root
export const PopoverAnchor = Primitive.Anchor

export const PopoverContent = forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(function PopoverContent({ className = '', ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        ref={ref}
        className={`mixjam-popover-content ${className}`.trim()}
        sideOffset={6}
        collisionPadding={8}
        {...props}
      />
    </Primitive.Portal>
  )
})
