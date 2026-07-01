# MixJam Electron Skills

Qoder-native plugin converted from GitHub Copilot skills at `.github/skills/`.

## Skills Included

| Skill | Description |
|-------|-------------|
| `ablation-test` | Disciplined ablation workflow to prove which changed files are required for a fix |
| `add-feature` | Creates/updates specs, acceptance criteria, and durable decisions for new work |
| `claude-design-parity` | Extracts design tokens from Claude Design mockups and drives CSS theme parity |
| `dead-code-audit` | Audits for dead TypeScript code, orphan files, and unused symbols |
| `deslop` | Removes AI-generated code slop from branch diffs |
| `diagnose` | Disciplined diagnosis loop for hard bugs and performance regressions |
| `full-code-review` | Strict maintainability review focused on code-judo restructurings |
| `grill-me` | Relentless interview about a plan/design to stress-test before building |
| `handoff` | Produces a state-transfer document for fresh agent sessions |
| `improve-codebase-architecture` | Surfaces architectural friction with visual HTML report |
| `refactor` | Surgical, behavior-preserving cleanup |
| `run-quality-gate` | Deterministic quality-gate execution for repo hygiene |
| `teach` | Multi-session teaching workspace for learning new skills/concepts |
| `writing-great-skills` | Reference for writing predictable agent skills |

## Source

Converted from: `.github/skills/` (GitHub Copilot skill format)

## Adaptations

- Removed `disable-model-invocation: true` (Qoder skills are invoked by `/name`)
- Removed VS Code-specific `tools:` frontmatter from `grill-me`
- Removed VS Code-specific `subagent_type=Explore` reference from `improve-codebase-architecture`
- Relocated `teach` support files into `references/` subdirectory with updated links

## Usage

Invoke any skill with `/skill-name` in Qoder, for example:

- `/diagnose` — start a diagnosis loop
- `/full-code-review` — run a strict code review
- `/run-quality-gate` — execute the quality gates
- `/deslop` — remove AI slop from the current branch
