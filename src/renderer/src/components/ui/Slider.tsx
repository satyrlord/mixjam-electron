import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import * as Primitive from '@radix-ui/react-slider'
import { Tooltip } from './Tooltip'

type RootProps = ComponentPropsWithoutRef<typeof Primitive.Root>
type ThumbProps = ComponentPropsWithoutRef<typeof Primitive.Thumb>

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export interface LinearSliderProps extends Omit<
  RootProps,
  'children' | 'defaultValue' | 'onValueChange' | 'value'
> {
  value: number
  onValueChange: (value: number) => void
  ariaLabel: string
  ariaValueText?: string
  tooltip?: string
  resetKey?: string
  trackClassName?: string
  thumbClassName?: string
  trackChildren?: ReactNode
  showRange?: boolean
  thumbProps?: Omit<ThumbProps, 'aria-label' | 'aria-valuetext' | 'children' | 'className'>
}

/**
 * The single visual and behavioral primitive for numeric linear values.
 * Contexts may size or decorate the track, but rail, range, hit target, and
 * painted hardware handle always come from this component.
 */
export function LinearSlider({
  value,
  onValueChange,
  ariaLabel,
  ariaValueText,
  tooltip,
  resetKey,
  className,
  trackClassName,
  thumbClassName,
  trackChildren,
  showRange = true,
  thumbProps,
  orientation = 'horizontal',
  ...rootProps
}: LinearSliderProps) {
  const thumb = (
    <Primitive.Thumb
      {...thumbProps}
      className={joinClasses('linear-slider-thumb', thumbClassName)}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      data-reset-key={resetKey}
    >
      <span className="linear-slider-handle" aria-hidden="true" />
    </Primitive.Thumb>
  )

  return (
    <Primitive.Root
      {...rootProps}
      className={joinClasses('linear-slider', className)}
      orientation={orientation}
      value={[value]}
      onValueChange={([next]) => onValueChange(next)}
    >
      <Primitive.Track className={joinClasses('linear-slider-track', trackClassName)}>
        {showRange && <Primitive.Range className="linear-slider-range" />}
        {trackChildren}
      </Primitive.Track>
      {tooltip ? <Tooltip content={tooltip}>{thumb}</Tooltip> : thumb}
    </Primitive.Root>
  )
}
