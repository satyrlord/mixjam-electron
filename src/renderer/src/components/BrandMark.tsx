interface BrandMarkProps {
  size?: number
}

// Bar heights of the logo waveform, centered on the vertical middle. The
// silhouette rises to a peak and falls off — a bar-graph "jam" pulse.
const WAVE_BAR_HEIGHTS = [12, 24, 40, 48, 34, 20, 10]
const WAVE_BAR_WIDTH = 4
const WAVE_BAR_GAP = 4

/**
 * MixJam brandmark: a rounded tile filled with the theme accent gradient and a
 * waveform pulse. Painted entirely with theme tokens so it re-skins with the
 * active theme (spec-002 AC-008: no hardcoded colors).
 */
export default function BrandMark({ size = 64 }: BrandMarkProps) {
  const totalBarsWidth =
    WAVE_BAR_HEIGHTS.length * WAVE_BAR_WIDTH + (WAVE_BAR_HEIGHTS.length - 1) * WAVE_BAR_GAP
  const firstBarX = (64 - totalBarsWidth) / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="MixJam logo"
      className="brand-mark"
    >
      <defs>
        <linearGradient id="brand-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-dark)" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="14"
        fill="url(#brand-mark-fill)"
        stroke="var(--highlight)"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <g fill="var(--text)">
        {WAVE_BAR_HEIGHTS.map((height, i) => (
          <rect
            key={i}
            x={firstBarX + i * (WAVE_BAR_WIDTH + WAVE_BAR_GAP)}
            y={32 - height / 2}
            width={WAVE_BAR_WIDTH}
            height={height}
            rx="2"
          />
        ))}
      </g>
    </svg>
  )
}
