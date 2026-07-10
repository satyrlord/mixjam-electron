# Design Router Skill

A single Claude Code skill bundling 67 design themes from the
[typeui.sh](https://www.typeui.sh/design-skills) registry
([bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills),
MIT licensed).

Structure:

- [SKILL.md](SKILL.md) — the router: categorized catalog mapping a desired vibe to a theme
- `themes/<slug>.md` — 67 theme files, each a full design system (tokens, typography, spacing, component rules, quality gates, design intent — merged from the registry's SKILL.md + DESIGN.md)
- `registry-index.json` — registry index, kept for updates

## Reusing across projects

**Global (recommended)** — available in every project:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\design-router" -Target "D:\dev\_skills\design-router"
```

**Per project:**

```powershell
New-Item -ItemType Junction -Path "<project>\.claude\skills\design-router" -Target "D:\dev\_skills\design-router"
```

Or just copy the `design-router` folder into `<project>\.claude\skills\`.

## Updating themes

Re-clone [bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills),
then for each `skills/<slug>/`, strip the frontmatter from `SKILL.md`,
append `DESIGN.md` under a `## Design intent (from DESIGN.md)` heading,
and save as `design-router/themes/<slug>.md`.
