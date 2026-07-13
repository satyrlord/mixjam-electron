import type { ReactElement, ReactNode } from 'react'
import * as Primitive from '@radix-ui/react-tooltip'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Primitive.Provider delayDuration={350} skipDelayDuration={150}>{children}</Primitive.Provider>
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <Primitive.Provider delayDuration={350} skipDelayDuration={150}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content className="mixjam-tooltip-content" sideOffset={6} collisionPadding={8}>
            {content}
            <Primitive.Arrow className="mixjam-tooltip-arrow" />
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  )
}
