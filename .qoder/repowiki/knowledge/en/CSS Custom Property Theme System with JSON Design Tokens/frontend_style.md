## System Overview
MixJam Electron uses a **CSS custom property (variable) design system** driven by **JSON design tokens**. There is no CSS preprocessor (Sass/Less) or utility-first framework (Tailwind). Instead, visual consistency is enforced by defining a fixed vocabulary of `--token` names in `src/renderer/src/index.css`, with values supplied by one of eight runtime themes.

Themes are defined as JSON files in `public/themes/` (e.g., `emerald.json`, `rave.json`). At runtime, `src/renderer/src/theme/themes.ts` reads these JSON files and applies them by setting CSS custom properties directly on the `document.documentElement` via `style.setProperty()`. This allows for instant theme switching without page reloads or complex React context providers for styling.

## Key Files and Packages
- **`src/renderer/src/index.css`**: The core stylesheet. It defines the structural layout (Flexbox/Grid), component classes (`.header`, `.tracker-view`, `.folder-card`), and references all visual values via `var(--token-name)`.
- **`public/themes/*.json`**: The source of truth for theme values. Each file contains `colors`, `fonts`, `depth` (gradients/shadows), and `radius` definitions.
- **`src/renderer/src/theme/themes.ts`**: The theme engine. It imports JSON themes, resolves the active theme, and applies tokens to the DOM. It also manages the `data-theme-key` attribute used for CSS selectors.
- **`.design-sync/conventions.md`**: Documentation for the design system, detailing token vocabulary and component composition rules.
- **`ds-bundle/_ds_bundle.css`**: A generated static CSS bundle used for design previews and tooling, concatenating `index.css` with static theme blocks.

## Architecture and Conventions
### Token Vocabulary
All styling must use the predefined token set. Hardcoding colors (e.g., `#00674F`) in components or CSS is prohibited (spec-002 AC-008). Key token categories include:
- **Surfaces**: `--bg-base`, `--bg-panel`, `--bg-lane`, `--chrome`.
- **Text**: `--text`, `--text-muted`, `--highlight`.
- **Brand/Interaction**: `--accent`, `--accent-dark`.
- **Typography**: `--font-chrome` (headers), `--font-label` (body), `--font-mono` (data/time).
- **Depth**: `--gradient-header`, `--shadow-clip-text`.

### Theme Switching Mechanism
1. **Bootstrap**: On load, `bootstrapTheme()` applies the default 'emerald' theme and sets `html[data-theme-ready='true']`, which changes `body` visibility from `hidden` to `visible` to prevent FOUC (Flash of Unstyled Content).
2. **Selection**: `selectTheme(key)` updates the CSS variables on the root element and sets `data-theme-key="<key>"`.
3. **Specific Overrides**: Some themes (e.g., 'rust', 'screen') use `[data-theme-key='...']` selectors in `index.css` to apply unique pseudo-element effects (noise, scanlines) that are not part of the standard token set.

### Component Styling
Components are styled using semantic class names (BEM-like but flatter) defined in `index.css`. Layouts rely heavily on **CSS Grid** (for the main tracker view) and **Flexbox** (for headers/footers). The `TrackerView` uses a specific grid template: `grid-template-rows: minmax(0,1fr) 44px minmax(0,1fr)` to ensure the central control strip remains fixed while lanes expand.

## Rules for Developers
1. **Never Hardcode Colors**: Always use `var(--token)` in CSS and JSX styles.
2. **Use ThemeBootstrap**: In preview environments, wrap components in `<ThemeBootstrap>` to ensure tokens are applied and the UI is visible.
3. **Respect Visibility Hidden**: The app starts with `body { visibility: hidden }`. Do not remove this; it ensures the user never sees an unthemed flash.
4. **Font Usage**: Use the semantic font tokens (`--font-chrome`, `--font-label`, `--font-mono`) rather than specifying font families directly. The system maps these to specific fonts (Josefin Sans, Ubuntu, JetBrains Mono, Special Elite) per theme.
5. **Layout Constraints**: When composing `TrackerView`, ensure its parent has a defined height (e.g., `100vh` or `flex: 1` in a flex column) because its grid rows use `minmax(0, 1fr)` which collapses without explicit height.