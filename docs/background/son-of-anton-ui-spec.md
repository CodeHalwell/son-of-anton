# Son of Anton — Visual & UI Design Specification

**Version:** 0.1  
**Status:** Draft  
**Scope:** Visual identity, UI chrome, and surface design for the Son of Anton agentic IDE

---

## 1. Design Principles

Son of Anton is not a reskinned text editor. It is an autonomous engineering complex with Mission Control orchestration, spec-driven workflows, tri-modal memory, and a live DAG explorer. The visual design must make that infrastructure *legible at a glance*. Every design decision should be evaluated against three questions:

1. **Does it signal agency?** The UI should communicate that autonomous processes are running, reviewable, and controllable — not that a chat widget has been bolted onto VS Code.
2. **Does it build trust?** Transparency is non-negotiable. Cost, context usage, agent attribution, and checkpoint state must be visible without hunting for them.
3. **Is it distinctively Son of Anton?** If a screenshot could pass for stock VS Code or Cursor, it hasn't gone far enough.

---

## 2. Core Problem with the Current State

Son of Anton currently presents as VS Code with amber accents. The activity bar layout, tab strip, gutter, and welcome screen are all stock. Cursor deviates from VS Code by restructuring chrome around AI as a primary surface; Son of Anton must go further still, because its actual differentiator — Mission Control, the DAG explorer, spec artefacts, tri-modal memory — is entirely invisible in the current interface.

The gap is not cosmetic. It is structural. The solution is not to restyle VS Code; it is to build surfaces that VS Code does not have, and make those surfaces the product's defining visual identity.

---

## 3. Dual Interface Modes

The most significant architectural departure from VS Code is the introduction of two distinct interface modes. These are not panels or tabs — they are genuine context switches, each with its own visual language.

### 3.1 Editor Mode

The focused, low-chrome coding surface. The goal is maximum information density with the IDE getting out of the way.

- Near-black background: `#0D0D0D`
- Amber cursor line highlight: thin left-border glow rather than full-line background tint
- Minimal gutter: muted gold line numbers (`#B8860B`), no VS Code decorations unless agent-relevant
- No welcome screen chrome — cold starts open the last workspace directly
- Activity bar icons use Son of Anton's own iconography (see §7), not VS Code defaults

### 3.2 Mission Control Mode

A spatial orchestration canvas, deliberately distinct from the editor. More Figma or Miro than VS Code. This is where the developer acts as architectural director rather than typist.

- Slightly lighter background: `#111111`, to signal a different context
- Agent task cards arranged in a kanban-style or graph-based spatial layout
- Live DAG visualisation rendered in gold node/edge styling (see §6)
- Terminal stream summaries rendered as semantic blocks with agent attribution
- Full-width layout — no editor pane, no file tree

The toggle between Editor Mode and Mission Control is a deliberate, keyboard-accessible context switch (suggested: `⌘⇧M`). The act of switching is itself a statement about what the product is.

---

## 4. Activity Bar

The activity bar must reflect Son of Anton's actual feature set, not the generic VS Code defaults. Shipping with Explorer / Search / Source Control / Extensions signals "VS Code fork." Shipping with the following signals a distinct product with its own conceptual model.

| Position | Surface | Icon concept |
|---|---|---|
| 1 | Agent Tasks | Branching node graph |
| 2 | Explorer | Folder tree (retained — familiar anchor) |
| 3 | DAG Explorer | Directed graph / dependency web |
| 4 | Memory Browser | Layered cylinders (vector/graph/keyword) |
| 5 | Spec Documents | Structured document with checklist |
| 6 | MCP Connections | Plug / socket |
| 7 | Search | Magnifier (retained) |

All icons use the two-gold system: active state `#F5A623`, inactive `#B8860B`. No VS Code blue anywhere in the chrome.

The activity bar itself should be slightly narrower than VS Code default (40px vs 48px), contributing to a tighter, more deliberate feel.

---

## 5. Spec Documents — First-Class Surface

`requirements.md`, `design.md`, and `tasks.md` are core artefacts of the spec-driven development workflow. They must not open as plain markdown files. They deserve a distinct rendering mode that makes them feel like structured engineering objects.

### Rendering treatment

- **Requirements view**: EARS notation clauses (`WHEN … THE SYSTEM SHALL …`) rendered as distinct cards, not prose. Each clause has a pass/fail indicator (amber pending, green satisfied, red violated).
- **Design view**: Architecture sections rendered with inline Mermaid diagrams expanded by default. Data flow notation highlighted.
- **Tasks view**: Discrete implementation steps rendered as a checklist with dependency lines between tasks. Completed tasks collapse. Agent-completed tasks carry an attribution badge.

### Visual language

- Card backgrounds: `#161616`
- Card borders: `1px solid #2A2A2A`, amber glow on hover
- EARS keyword highlighting: `WHEN`, `IF`, `SHALL` in muted amber `#C8962A`
- Progress indicator along the top of each spec document: a slim amber bar tracking completion percentage

Opening a spec document should feel like opening a product requirements tool, not a text file.

---

## 6. DAG Explorer

The live, interactive dependency graph is the most visually distinctive surface in Son of Anton and the one that no competitor offers as a first-class view. This is the centrepiece of the product's visual identity.

### What it renders

- **Build/dependency DAG**: what must exist, be installed, or be built — sourced from Cargo, Nx, Gradle, Poetry, etc. depending on detected ecosystem
- **Task DAG**: what commands must run, in what order, under what environment
- **Impact radius overlay**: when an agent is about to modify a node, the graph highlights all inbound dependents in amber — making the blast radius legible before any code changes

### Visual language

- Canvas background: `#0A0A0A`
- Nodes: rounded rectangles, background `#1A1A1A`, border `#2A2A2A`
- Active/selected node: amber border `#F5A623`, subtle amber drop shadow
- Edges: `#3A3A3A` at rest, `#F5A623` when part of a highlighted path
- Impact radius highlight: amber node border + amber edge + a muted amber fill on affected nodes
- Orphaned or unreachable nodes: dimmed to `40%` opacity

### Interaction model

- Pan and zoom on the canvas
- Click a node to see its dependents and dependencies in a side panel
- Right-click a node to dispatch an agent task scoped to that module
- Keyboard shortcut to enter "impact analysis" mode for any symbol under the cursor in the editor

A screenshot of Son of Anton showing this surface should be immediately unrecognisable as a VS Code fork.

---

## 7. Terminal Blocks with Agent Attribution

The terminal must be reimagined as a semantic, block-based interface rather than a raw text stream. This draws from Warp's block model but extends it with agent provenance.

### Block types

| Block type | Left border | Label |
|---|---|---|
| Manual command | `#3A3A3A` (grey) | None |
| Agent-originated | `#F5A623` (amber) | Agent name + model |
| Build/test output | `#2A5A2A` (green) or `#5A2A2A` (red) | Pass / Fail |
| Checkpoint marker | `#B8860B` (muted gold) | Snapshot ID |

### Block metadata (shown on hover or expand)

- Originating agent and model
- Token cost for the operation
- Timestamp
- One-click "checkpoint from here" action
- One-click "revert to this state" if a checkpoint exists

The slim amber left-border on agent blocks makes the agent's footprint immediately visible without being intrusive. Developers can audit exactly what the agent ran and when, without digging through logs.

---

## 8. Tab Bar

VS Code tabs are rectangular with a close button — entirely generic. Son of Anton tabs should carry additional state information while maintaining visual economy.

### Proposed treatment

- Tab shape: slight bottom-corner radius (4px) to soften without going fully pill-shaped
- Unsaved indicator: amber dot (already present — keep and formalise)
- Agent-modified indicator: amber left-edge shimmer (animates in when an agent has written to the file)
- Spec document tabs: amber document icon prepended to filename
- Active tab: `#1A1A1A` background, `#F5A623` bottom border (2px)
- Inactive tab: `#0D0D0D` background, `#2A2A2A` bottom border

Tab overflow should collapse into a scrollable strip, never a dropdown — dropdowns break the spatial model of open files.

---

## 9. Title Bar and Window Chrome

Custom title bars on macOS are low-effort, high-return. The current stock title bar is an immediate signal of "electron app with defaults."

### Proposed treatment

- Full-bleed dark bar: `#0A0A0A`
- Traffic lights inset left (macOS standard position)
- Centred wordmark: `Son of Anton` in the chosen UI font, tracking `+0.05em`, weight `500`, colour `#F5A623`
- Right side: current model indicator (e.g. `claude-sonnet-4` or `ollama/qwen2.5`), context usage bar, cost ticker — all in muted gold `#B8860B`

The cost ticker and context bar in the title bar addresses one of the most consistent user complaints about agentic tools: lack of real-time visibility into what is being consumed.

---

## 10. Colour System

| Token | Value | Usage |
|---|---|---|
| `--background-primary` | `#0D0D0D` | Editor, main surfaces |
| `--background-secondary` | `#111111` | Mission Control canvas |
| `--background-elevated` | `#161616` | Cards, panels, spec doc surfaces |
| `--background-hover` | `#1A1A1A` | Hover states, active tabs |
| `--border-default` | `#2A2A2A` | Panel borders, card outlines |
| `--border-subtle` | `#1E1E1E` | Gutter separators, inactive dividers |
| `--gold-primary` | `#F5A623` | Interactive, active, selected states |
| `--gold-secondary` | `#B8860B` | Structural chrome, inactive indicators |
| `--gold-dim` | `#C8962A` | EARS notation, syntax highlights |
| `--text-primary` | `#E8E8E8` | Body text, editor content |
| `--text-secondary` | `#888888` | Labels, breadcrumbs, inactive items |
| `--text-muted` | `#555555` | Timestamps, metadata, de-emphasised |
| `--status-success` | `#2A5A2A` | Test pass, build success |
| `--status-error` | `#5A2A2A` | Test fail, build error |
| `--status-warning` | `#5A4A0A` | Warnings, deprecation notices |

VS Code blue (`#007ACC` and variants) should not appear anywhere in Son of Anton's chrome. Where VS Code uses blue for interactive states, Son of Anton uses gold.

---

## 11. Typography

Specifying a custom UI font is an immediate, low-effort differentiator from stock VS Code, which uses the system stack (Segoe UI on Windows, SF Pro on macOS).

### UI font

**Geist** (by Vercel, SIL Open Font Licence) — clean, technical, slightly editorial. Not used by any current IDE.

- Fallback: Inter, then system-ui
- Weights used: 400 (body), 500 (labels, tab names), 600 (headings in spec docs and Mission Control cards)
- Tracking: `+0.01em` for labels, `+0.05em` for the wordmark only

### Editor font

No prescription — user-configured monospace. The default bundled font should be **Geist Mono** for consistency with the UI font family.

### Surface-specific type treatment

- Mission Control cards: proportional type (Geist), not monospace. This signals that Mission Control is not an editor surface.
- Spec documents: proportional type for prose sections, monospace for code blocks and EARS clauses.
- Terminal blocks: monospace for command/output content, proportional for block metadata labels.

---

## 12. Welcome Screen

The current welcome screen uses the stock VS Code layout with a new title. It should be replaced entirely.

### Proposed treatment

- Full-canvas dark layout — no left/right split, no panel chrome
- Large centred wordmark `Son of Anton` in Geist 600, gold
- Subtitle: `Agentic development environment` in Geist 400, muted
- Two primary actions: `Open Project` and `New Agent Task` — styled as amber outlined buttons, not VS Code's default orange fill
- Recent projects: minimal list, no icons, just paths in monospace with relative timestamps
- No "Clone Repository" styled like a modal. No "Show welcome page on startup" checkbox visible on cold start — that belongs in settings.
- Bottom-left: current model stack and memory status (e.g. `Memory: 1,240 nodes · 3 graphs`)

---

## 13. What to Build First — Prioritised by Visual Return

The following ordering maximises visual differentiation per unit of effort:

1. **Mission Control canvas** — unique to Son of Anton, immediately striking, impossible to mistake for VS Code
2. **DAG Explorer panel** — no competitor has this as a first-class surface; one screenshot makes the product's architecture legible
3. **Activity bar icon set** — Son of Anton's own conceptual model, not VS Code's generic defaults
4. **Title bar** — custom wordmark, model indicator, cost ticker
5. **Terminal block attribution** — agent provenance visible at a glance
6. **Spec document renderer** — EARS cards, task progress, structured artefact view
7. **Tab state indicators** — agent-modified shimmer, spec document icon
8. **Welcome screen** — coherent cold-start experience

Items 1 and 2 are the inflection point. After those, Son of Anton no longer reads as a fork. Everything else is refinement.

---

## 14. What to Avoid

- **VS Code blue anywhere in the chrome.** Any `#007ACC` or `#1E9BE0` is an immediate regression.
- **Amber as pure accent.** Gold should be structural — it should appear in borders, gutter indicators, and DAG edges, not only in hover states.
- **Monospace type on non-editor surfaces.** Mission Control, Spec Documents, and the welcome screen should use proportional type to signal they are not text buffers.
- **Vague agent activity.** Spinners with no attribution. "Thinking…" with no model or cost. Any agent action that cannot be traced to a specific operation is a trust failure.
- **Burying the DAG.** If the dependency graph lives in a panel that requires three clicks to open, it is invisible. It should be a top-level activity bar item and the default view when Mission Control mode is active.

---

*This specification should be treated as a living document. Sections 5, 6, and 7 in particular will evolve as the underlying agent runtime matures and real interaction patterns emerge.*
