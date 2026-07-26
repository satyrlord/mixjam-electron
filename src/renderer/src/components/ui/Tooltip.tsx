import type { ReactElement, ReactNode } from 'react'
import * as Primitive from '@radix-ui/react-tooltip'

const OPEN_DELAY_MS = 350
/** Window after a tooltip closes in which the next one opens immediately. */
const SKIP_DELAY_MS = 150

/**
 * Mounted once, at the app root. `skipDelayDuration` is a property of the
 * provider's scope: moving between two triggers only skips the open delay when
 * both share one provider, so a tooltip must never nest its own.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Primitive.Provider delayDuration={OPEN_DELAY_MS} skipDelayDuration={SKIP_DELAY_MS}>
      {children}
    </Primitive.Provider>
  )
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content className="mixjam-tooltip-content" sideOffset={6} collisionPadding={8}>
          {content}
          <Primitive.Arrow className="mixjam-tooltip-arrow" />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
