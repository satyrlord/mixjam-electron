import { forwardRef } from 'react'
import * as Primitive from '@radix-ui/react-dialog'

export const DialogRoot = Primitive.Root
export const DialogClose = Primitive.Close
export const DialogTitle = Primitive.Title

type DialogContentProps = React.ComponentPropsWithoutRef<typeof Primitive.Content> & {
  onOverlayClick?: React.MouseEventHandler<HTMLDivElement>
}

export const DialogContent = forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  DialogContentProps
>(function DialogContent({ className = '', onOverlayClick, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="mixjam-dialog-overlay" onClick={onOverlayClick} />
      <Primitive.Content
        ref={ref}
        className={`mixjam-dialog-content ${className}`.trim()}
        {...props}
      />
    </Primitive.Portal>
  )
})
