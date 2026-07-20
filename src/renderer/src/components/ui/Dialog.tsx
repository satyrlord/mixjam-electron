import { forwardRef, useEffect, useRef } from 'react'
import * as Primitive from '@radix-ui/react-dialog'

export const DialogRoot = Primitive.Root
export const DialogClose = Primitive.Close
export const DialogTitle = Primitive.Title

type DialogContentProps = React.ComponentPropsWithoutRef<typeof Primitive.Content> & {
  onOverlayClick?: React.MouseEventHandler<HTMLDivElement>
}

let blockingDialogCount = 0

function setGlobalModalBlocking(active: boolean): void {
  blockingDialogCount = Math.max(0, blockingDialogCount + (active ? 1 : -1))
  if (blockingDialogCount > 0) document.body.dataset.mixjamModalBlocking = '1'
  else delete document.body.dataset.mixjamModalBlocking
}

export const DialogContent = forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  DialogContentProps
>(function DialogContent({ className = '', onOverlayClick, ...props }, ref) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay
        className="mixjam-dialog-overlay"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onOverlayClick?.(event)
        }}
      />
      <Primitive.Content
        ref={ref}
        className={`mixjam-dialog-content ${className}`.trim()}
        {...props}
      />
    </Primitive.Portal>
  )
})

type BlockingDialogContentProps = DialogContentProps & {
  restoreFocus?: () => void
}

export const BlockingDialogContent = forwardRef<
  React.ElementRef<typeof Primitive.Content>,
  BlockingDialogContentProps
>(function BlockingDialogContent({ onCloseAutoFocus, restoreFocus, ...props }, ref) {
  const restoreFocusRef = useRef(restoreFocus)
  restoreFocusRef.current = restoreFocus
  const openerRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  )

  useEffect(() => {
    const opener = openerRef.current
    setGlobalModalBlocking(true)
    return () => {
      setGlobalModalBlocking(false)
      if (restoreFocusRef.current) restoreFocusRef.current()
      else opener?.focus()
    }
  }, [])

  return (
    <DialogContent
      ref={ref}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event)
        event.preventDefault()
      }}
      {...props}
    />
  )
})
