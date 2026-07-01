# Claude Design Parity Examples

## Worked Example: Warm Analog Theme Parity Audit

A complete parity audit for the Warm Analog theme. The mockup
`redesign/option-c-warm-analog.html` was fetched with
`DesignSync get_file` from the **MixJam Redesign Options** project
(`7a1e081e-36c0-48b5-a3d4-39a80a551689`) and cached at
`tmp/design-parity/in/7a1e081e-36c0-48b5-a3d4-39a80a551689/redesign/option-c-warm-analog.html`,
then compared against the project's theme CSS file
(e.g. `src/ui/theme/themes/warm-analog.css`).

### Step 1: Extract design tokens from mockup CSS

From the mockup's `:root { }` block:

```text
--accent:      #D99A3D    → --color-accent
--accent-dark: #8A5E1F    → --color-accent-dark
--highlight:   #F2C879    → --color-highlight
--bg-base:     #1C1612    → --color-bg-base
--bg-panel:    #211A14    → --color-bg-panel
--bg-lane:     #241D16    → --color-bg-lane
--bg-grid:     #171210    → --color-bg-grid
--chrome:      #2B221A    → --color-chrome
--panel-border: rgba(217,154,61,0.22)  → --color-border-panel: #38D99A3D
--header-border: rgba(217,154,61,0.30) → --color-border-header: #4DD99A3D
--text:        #F2E8D8    → --color-text-primary
--text-muted:  #BFAE96    → --color-text-muted
--pill-bg:     #332820    → --color-pill-bg
--pill-border: rgba(217,154,61,0.40)   → --color-pill-border: #66D99A3D
--playhead:    #E05A3A    → --color-playhead
--radius:      8px        → --radius-default
```

### Step 2: Audit current theme

#### Colors — MATCHED

All 14 core palette tokens in the theme CSS match the mockup values
exactly.

#### Clip styling — CLOSE

| Detail | Mockup | Current | Verdict |
|---|---|---|---|
| Fill recipe | `linear-gradient(180deg, mix(85% slot + cream), slot)` | `--clip-gradient` similar recipe | Recipe differs slightly |
| Top highlight | `color-mix(85% slot, cream)` = ~15% cream | `--clip-highlight-amount: 0.15` | Matches |
| Inset highlight | `inset 0 1px 0 rgba(255,255,255,0.28)` | Uses cream at 15% | Slightly less glassy |
| Text shadow | `1.5px 1.5px 2px rgba(0,0,0,0.6)` | `--shadow-clip-text: ...` opacity=0.6 | Matches |

#### Header — MINOR GAP

| Detail | Mockup | Current | Verdict |
|---|---|---|---|
| Background | `linear-gradient(180deg, #332720, #281F18)` | `--gradient-header` same | Matches |
| Bottom border | `1px solid rgba(217,154,61,0.3)` | `--color-border-header` same | Matches |
| Top inset highlight | `inset 0 1px 0 rgba(242,232,216,0.08)` | Not present | **Missing** |

#### Focused lane — NOT VERIFIED

| Detail | Mockup | Verdict |
|---|---|---|
| Lane head accent bar | `inset 2px 0 0 var(--accent)` on `.lane.focused .lane-head` | **Needs check** |
| Lane name highlight | `color: var(--highlight)` on focused | **Needs check** |
| Track background | `rgba(255,255,255,0.04)` on focused | **Needs check** |

#### Structural proportions — ACCEPTED DELTA

| Element | Mockup | Reason |
|---|---|---|
| Lane height | 44 px | 16 lanes must fit in grid view height |

#### Transport — MATCHED

Play button styling, border-radius, and accent color match.

### Step 3: Classification

| Gap | Severity | Action |
|---|---|---|
| Header inset highlight | Subtle | Add `--shadow-header-inset` custom property |
| Clip glassiness | Subtle | Bump highlight amount to 0.20 |
| Focused lane accent | Visible | Verify and implement if missing |
| Lane proportions | Accepted | Document as functional constraint |

### Step 4: Generated fixes

#### Fix 1: Header inset highlight

Add to the theme CSS:

```css
--shadow-header-inset: inset 0 1px 0 rgba(242,232,216,0.08);
```

Apply as `box-shadow` on the header element.

#### Fix 2: Clip glassiness

Increase:

```css
--clip-highlight-amount: 0.20;
```

#### Fix 3: Focused lane accent bar

Add:

```css
--color-lane-accent: #D99A3D;
```

Applied as a 2 px left border on the lane head when the lane has focus.
