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

/* A menu whose items are a single-choice set (presets, modes). `menuitem` has
   no checked state — putting `aria-checked` on one is invalid ARIA and screen
   readers drop it — so selection must be expressed with the radio roles. */
export const DropdownMenuRadioGroup = Primitive.RadioGroup

export const DropdownMenuRadioItem = forwardRef<
  React.ElementRef<typeof Primitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof Primitive.RadioItem>
>(function DropdownMenuRadioItem({ className = '', ...props }, ref) {
  return (
    <Primitive.RadioItem ref={ref} className={`mixjam-menu-item ${className}`.trim()} {...props} />
  )
})
