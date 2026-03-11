# Spec Renderer

**Surface:** #6 of 8
**Priority:** Medium
**Status:** Draft
**Date:** 2026-03-10
**Tier:** 1 (new files alongside core)

---

## Overview

Spec documents (`requirements.md`, `design.md`, `tasks.md`) are first-class artefacts in Son of Anton's spec-driven development workflow. They must not render as plain markdown. The Spec Renderer provides a purpose-built viewing and interaction mode that surfaces structure, status, and progress at a glance.

The renderer intercepts `.md` files located under `.son-of-anton/specs/` and presents them through one of three specialised views depending on the document type. Files outside this directory open normally.

---

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--soa-bg-surface` | `#0D0D0D` | Full-canvas background |
| `--soa-bg-card` | `#161616` | Card backgrounds |
| `--soa-border-card` | `#2A2A2A` | Card borders |
| `--soa-amber` | `#F5A623` | Primary accent, progress bars, hover glows |
| `--soa-amber-muted` | `#C8962A` | EARS keyword highlighting |
| `--soa-green` | `#4CAF50` | Satisfied / completed status |
| `--soa-red` | `#E53935` | Violated / failed status |
| `--soa-text-primary` | `#E8E8E8` | Primary text |
| `--soa-text-secondary` | `#888888` | Secondary text, timestamps |
| `--soa-text-muted` | `#555555` | Tertiary text |
| `--soa-font-prose` | `'Geist', sans-serif` | Proportional prose |
| `--soa-font-mono` | `'Geist Mono', monospace` | Code blocks, paths |

---

## Requirements View

Renders `requirements.md` files that use EARS (Easy Approach to Requirements Syntax) notation.

### Clause Cards

Each EARS clause is parsed and rendered as a discrete card:

```
+------------------------------------------------------------------+
|  #161616 bg, 1px #2A2A2A border, 8px border-radius              |
|                                                                  |
|  [amber dot]  REQ-001                                #888888 id  |
|                                                                  |
|  WHEN the user opens a project                                   |
|  THE SYSTEM SHALL index all source files into the code graph     |
|                                                                  |
|                                              [status indicator]  |
+------------------------------------------------------------------+
```

- **Card background:** `#161616`
- **Card border:** `1px solid #2A2A2A`
- **Border radius:** `8px`
- **Padding:** `16px 20px`
- **Margin between cards:** `12px`
- **Hover effect:** `box-shadow: 0 0 12px rgba(245, 166, 35, 0.15)` (amber glow)
- **Transition:** `box-shadow 200ms ease`

### EARS Keyword Highlighting

Keywords are rendered in `#C8962A` with `font-weight: 600`:

| Keyword | Category |
|---------|----------|
| `WHEN` | Event-driven |
| `IF` | State-driven |
| `WHILE` | Optional / ongoing |
| `WHERE` | Feature-scoped |
| `SHALL` | Mandatory action |
| `SHALL NOT` | Prohibition |
| `SHOULD` | Advisory |

Regex pattern for parsing:

```typescript
const EARS_CLAUSE_PATTERN = /^(?:(?<prefix>WHEN|IF|WHILE|WHERE)\s+(?<condition>.+?)\s+)?THE\s+SYSTEM\s+(?<keyword>SHALL(?:\s+NOT)?|SHOULD)\s+(?<action>.+)$/gmi;
```

### Status Indicators

Each clause carries a pass/fail indicator, rendered as a pill badge on the right edge of the card:

| Status | Colour | Label | Icon |
|--------|--------|-------|------|
| Pending | `#F5A623` | `Pending` | `codicon-circle-outline` |
| Satisfied | `#4CAF50` | `Satisfied` | `codicon-pass-filled` |
| Violated | `#E53935` | `Violated` | `codicon-error` |

Badge styling:
- `padding: 2px 10px`
- `border-radius: 12px`
- `font-size: 11px`
- `font-weight: 500`
- Background: status colour at 15% opacity
- Text: status colour at 100%

### Progress Bar

A slim progress bar spans the full width at the top of the view:

- **Height:** `3px`
- **Track background:** `#2A2A2A`
- **Fill colour:** linear gradient from `#C8962A` to `#F5A623`
- **Calculation:** `(satisfied_count / total_count) * 100`
- **Border radius:** `0` (flush with top edge)
- **Transition:** `width 400ms ease-out`

---

## Design View

Renders `design.md` files with architecture-aware formatting.

### Layout

```
+----------------------------------------------------------------------+
| [3px amber progress bar -- tracks section completeness]              |
+------------+---------------------------------------------------------+
|            |                                                         |
|  Section   |  ## Architecture Overview                               |
|  Navigator |                                                         |
|            |  The system uses a layered architecture...              |
|  Overview  |                                                         |
|  > active  |  [mermaid code block]                                   |
|  Data Flow |  graph TD                                               |
|  Interfaces|    A[Parser] --> B[Graph DB]                            |
|  Security  |    B --> C[Query Engine]                                |
|            |  [Rendered Mermaid diagram, expanded]                    |
|            |                                                         |
|            |  ### Data Flow                                          |
|            |                                                         |
|            |  Source files flow through the following pipeline:      |
|            |  TreeSitter -> ASTExtractor -> FalkorDB                |
|            |                                                         |
+------------+---------------------------------------------------------+
```

### Section Navigation Sidebar

- **Width:** `180px`
- **Background:** `#111111`
- **Border right:** `1px solid #2A2A2A`
- Populated by parsing `##` and `###` headings from the markdown
- Active section: `#F5A623` left border (3px), `#E8E8E8` text
- Inactive sections: no left border, `#888888` text
- Click scrolls the main pane to the section
- Scroll position updates the active indicator (intersection observer)

### Mermaid Diagrams

- Fenced code blocks with language `mermaid` are rendered inline using mermaid.js
- Diagrams are **expanded by default** (not collapsed behind a toggle)
- Mermaid theme: dark background (`#161616`), amber node borders (`#F5A623`), `#E8E8E8` text
- Custom mermaid theme configuration:

```typescript
const MERMAID_THEME_CONFIG = {
	theme: 'base',
	themeVariables: {
		primaryColor: '#161616',
		primaryBorderColor: '#F5A623',
		primaryTextColor: '#E8E8E8',
		lineColor: '#F5A623',
		secondaryColor: '#1A1A1A',
		tertiaryColor: '#111111',
		fontFamily: 'Geist, sans-serif',
		fontSize: '13px',
	}
};
```

- Diagram container: `border: 1px solid #2A2A2A`, `border-radius: 8px`, `padding: 16px`, `background: #111111`
- Mermaid SVG output is inserted into the container using safe DOM methods (e.g. `DOMPurify.sanitize()` before appending via `createContextualFragment`, or by using mermaid's `bindFunctions` API to safely attach the SVG). Direct use of `innerHTML` is forbidden.

### Typography

- **Prose:** `Geist`, `15px`, `line-height: 1.65`, `color: #E8E8E8`
- **Headings:** `Geist`, `font-weight: 600`, `color: #F5A623` for `h2`, `#E8E8E8` for `h3`+
- **Code spans:** `Geist Mono`, `13px`, `background: #1A1A1A`, `padding: 2px 6px`, `border-radius: 4px`
- **Code blocks:** `Geist Mono`, `13px`, `background: #111111`, `border: 1px solid #2A2A2A`, `padding: 16px`
- **Data flow notation** (arrows like `-->`, `->`, `=>`) highlighted in `#F5A623`

---

## Tasks View

Renders `tasks.md` files as interactive checklists with dependency tracking.

### Task Checklist

```
+------------------------------------------------------------------+
| [3px amber progress bar -- 4/12 tasks complete: 33%]             |
|                                                                  |
|  12 tasks total  .  4 completed  .  2 in progress  .  6 pending |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | [x] Parse EARS notation from requirements.md               | |
|  |     completed by review-agent (sonnet)        2 hours ago  | |
|  +------------------------------------------------------------+ |
|                            | dependency line                     |
|  +------------------------------------------------------------+ |
|  | [ ] Build clause card component                            | |
|  |     depends on: Parse EARS notation                        | |
|  |     assigned to: code-agent                                | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

### Task Card States

| State | Checkbox | Background | Border | Text |
|-------|----------|------------|--------|------|
| Pending | `codicon-circle-outline` `#555555` | `#161616` | `#2A2A2A` | `#E8E8E8` |
| In progress | `codicon-loading~spin` `#F5A623` | `#161616` | `#F5A623` at 30% | `#E8E8E8` |
| Completed | `codicon-pass-filled` `#4CAF50` | `#111111` | `#2A2A2A` | `#888888` |
| Blocked | `codicon-circle-slash` `#E53935` | `#161616` | `#E53935` at 30% | `#888888` |

### Completed Task Collapse

- Completed tasks collapse to a single line by default: checkbox + title + attribution badge
- Click to expand and show full details
- Collapse animation: `max-height 200ms ease-out`

### Dependency Lines (Mini DAG)

- Thin vertical/angled lines (`1px solid #2A2A2A`) connect dependent tasks
- Lines run from the bottom-centre of the prerequisite card to the top-centre of the dependent card
- When a dependency is satisfied: line colour changes to `#4CAF50`
- Rendered via inline SVG overlaid on the task list
- Optional: toggle DAG visualisation on/off via toolbar button

### Agent Attribution Badge

Tasks completed by an agent carry an attribution badge:

```
+-------------------------------------------------+
|  [robot-icon] code-agent (sonnet)  .  2h ago    |
+-------------------------------------------------+
```

- `font-size: 11px`
- `color: #888888`
- Agent name: `#C8962A`
- Model in parentheses: `#555555`
- Icon: `codicon-hubot`

### Progress Bar

Same specification as the Requirements View progress bar, but tracks `completed_tasks / total_tasks`.

### Summary Row

Below the progress bar, a summary row in `12px`, `#888888`:

```
12 tasks total  .  4 completed  .  2 in progress  .  6 pending
```

Counts are coloured to match their state: completed in `#4CAF50`, in-progress in `#F5A623`, pending in `#555555`.

---

## Implementation

### Approach: Custom Editor Contribution

The Spec Renderer is implemented as a custom `EditorPane` that intercepts `.md` files located under `.son-of-anton/specs/`. All other markdown files continue to open in the standard text editor.

Alternative considered: a webview panel. The `EditorPane` approach is preferred because it integrates with the editor tab system, supports standard keyboard navigation, and avoids the webview sandbox overhead.

### File Detection

```typescript
function isSpecFile(resource: URI): SpecDocumentType | undefined {
	const path = resource.path;
	if (!path.includes('.son-of-anton/specs/')) {
		return undefined;
	}
	const filename = basename(resource);
	switch (filename) {
		case 'requirements.md': return 'requirements';
		case 'design.md': return 'design';
		case 'tasks.md': return 'tasks';
		default: return undefined;
	}
}
```

### Editor Contribution Registration

```typescript
class SpecRendererEditorContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.specRenderer';

	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
	) {
		this.editorResolverService.registerEditor(
			'*.md',
			{
				id: SpecRendererEditor.ID,
				label: localize('specRenderer', "Spec Renderer"),
				priority: RegisteredEditorPriority.option,
			},
			{},
			{
				createEditorInput: (editorInput) => {
					// Only intercept spec files
					const specType = isSpecFile(editorInput.resource);
					if (!specType) {
						return undefined;
					}
					return { editor: new SpecRendererEditorInput(editorInput.resource, specType) };
				}
			}
		);
	}
}
```

### Rendering Pipeline

1. **Read** the markdown file via `IFileService`
2. **Parse** the content based on document type:
   - Requirements: extract EARS clauses via regex
   - Design: parse headings for navigation, detect mermaid fences
   - Tasks: parse checkbox items, extract dependency annotations
3. **Render** into the editor pane's DOM:
   - Requirements: clause cards with status indicators
   - Design: prose with mermaid diagrams and section nav
   - Tasks: interactive checklist with DAG overlay
4. **Watch** the file for changes and re-parse/re-render on save

### Mermaid Integration

Mermaid.js is loaded asynchronously in the webview context. The rendered SVG must be sanitised before DOM insertion to prevent XSS:

```typescript
import mermaid from 'mermaid';
import { sanitize } from 'dompurify';

mermaid.initialize(MERMAID_THEME_CONFIG);

async function renderMermaidBlock(container: HTMLElement, code: string): Promise<void> {
	const id = `mermaid-${generateUuid()}`;
	const { svg } = await mermaid.render(id, code);
	// Clear previous content safely
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
	// Sanitise SVG and insert via safe DOM fragment
	const cleanSvg = sanitize(svg, { USE_PROFILES: { svg: true } });
	const template = document.createElement('template');
	template.textContent = '';
	const fragment = document.createRange().createContextualFragment(cleanSvg);
	container.appendChild(fragment);
}
```

### Task Parsing

Tasks are parsed from standard markdown checkbox syntax with extended annotations:

```markdown
- [x] Parse EARS notation from requirements.md
  - agent: review-agent
  - model: sonnet
  - completed: 2026-03-10T14:30:00Z

- [ ] Build clause card component
  - depends: Parse EARS notation
  - assigned: code-agent
```

Parser:

```typescript
const TASK_PATTERN = /^- \[(?<checked>x| )\] (?<description>.+)$/gm;
const TASK_META_PATTERN = /^\s+- (?<key>agent|model|completed|depends|assigned|status):\s*(?<value>.+)$/gm;
```

---

## Interfaces

```typescript
/**
 * The type of spec document being rendered.
 */
export type SpecDocumentType = 'requirements' | 'design' | 'tasks';

/**
 * Parsed spec document with type-specific content.
 */
export interface ISpecDocument {
	readonly type: SpecDocumentType;
	readonly resource: URI;
	readonly rawContent: string;
	readonly title: string;
	readonly parsedClauses?: IEarsClause[];
	readonly parsedTasks?: ITaskItem[];
	readonly parsedSections?: IDesignSection[];
}

/**
 * A single EARS requirement clause.
 */
export interface IEarsClause {
	/** Unique identifier, e.g. 'REQ-001' */
	readonly id: string;
	/** The EARS keyword: WHEN, IF, WHILE, WHERE, or undefined for ubiquitous */
	readonly keyword: 'WHEN' | 'IF' | 'WHILE' | 'WHERE' | undefined;
	/** The condition following the keyword (empty for ubiquitous requirements) */
	readonly condition: string;
	/** The action keyword: SHALL, SHALL NOT, SHOULD */
	readonly actionKeyword: 'SHALL' | 'SHALL NOT' | 'SHOULD';
	/** The required system action */
	readonly action: string;
	/** Current satisfaction status */
	readonly status: EarsClauseStatus;
	/** Source line number in the markdown file */
	readonly sourceLine: number;
}

export type EarsClauseStatus = 'pending' | 'satisfied' | 'violated';

/**
 * A single task item parsed from tasks.md.
 */
export interface ITaskItem {
	/** Unique identifier, e.g. 'TASK-001' */
	readonly id: string;
	/** Human-readable description */
	readonly description: string;
	/** Current completion status */
	readonly status: TaskItemStatus;
	/** IDs of tasks this task depends on */
	readonly dependencies: readonly string[];
	/** Agent attribution if completed by an agent */
	readonly agentAttribution?: IAgentAttribution;
	/** ISO 8601 completion timestamp */
	readonly completedAt?: string;
	/** Source line number in the markdown file */
	readonly sourceLine: number;
}

export type TaskItemStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';

/**
 * Attribution for agent-completed work.
 */
export interface IAgentAttribution {
	/** Agent identifier, e.g. 'code-agent' */
	readonly agentName: string;
	/** LLM model used, e.g. 'sonnet', 'opus', 'haiku' */
	readonly model: string;
}

/**
 * A section in a design document, used for navigation sidebar.
 */
export interface IDesignSection {
	/** Section heading text */
	readonly title: string;
	/** Heading level (2 for ##, 3 for ###, etc.) */
	readonly level: number;
	/** Whether this section contains a mermaid diagram */
	readonly hasMermaid: boolean;
	/** Source line number in the markdown file */
	readonly sourceLine: number;
}

/**
 * Service for parsing spec documents.
 */
export interface ISpecDocumentParser {
	/**
	 * Parse a raw markdown string into a structured spec document.
	 */
	parse(resource: URI, content: string, type: SpecDocumentType): ISpecDocument;
}

/**
 * Service for tracking requirement clause statuses.
 */
export interface IClauseStatusService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the current status of a clause.
	 */
	getStatus(featureName: string, clauseId: string): EarsClauseStatus;

	/**
	 * Update the status of a clause.
	 */
	setStatus(featureName: string, clauseId: string, status: EarsClauseStatus): void;

	/**
	 * Fired when any clause status changes.
	 */
	readonly onDidChangeStatus: Event<{ featureName: string; clauseId: string; status: EarsClauseStatus }>;
}
```

---

## File Locations

All new files. Tier 1 modification.

```
src/vs/sessions/contrib/specRenderer/
  browser/
    specRenderer.contribution.ts       -- Registers the custom editor contribution
    specRendererEditor.ts              -- EditorPane subclass
    specRendererEditorInput.ts         -- Custom editor input for spec files
    specDocumentParser.ts              -- Parses markdown into ISpecDocument
    clauseStatusService.ts             -- Tracks requirement satisfaction state
    components/
      clauseCard.ts                    -- Reusable EARS clause card component
      taskCard.ts                      -- Reusable task card component
      progressBar.ts                   -- Slim amber progress bar
      sectionNav.ts                    -- Design view section navigator
      dagOverlay.ts                    -- SVG dependency line renderer
      agentBadge.ts                    -- Agent attribution badge
      mermaidRenderer.ts              -- Mermaid.js integration wrapper
    media/
      specRenderer.css                 -- All spec renderer styles
  common/
    specRenderer.ts                    -- Interfaces and types (ISpecDocument, IEarsClause, etc.)
  test/
    browser/
      specDocumentParser.test.ts       -- Parser unit tests
      clauseStatusService.test.ts      -- Status tracking tests
```

---

## Integration Points

| System | Integration | Direction |
|--------|-------------|-----------|
| Spec Pipeline | Reads pipeline state to set clause/task statuses | Spec Renderer reads from `ISpecPipelineService` |
| Editor Service | Custom editor resolver for `.md` files in spec dirs | Spec Renderer registers with `IEditorResolverService` |
| File Service | Watches spec files for changes | Spec Renderer watches via `IFileService` |
| Theme Service | Registers custom colours for cards, badges, progress | Spec Renderer registers colours via `registerColor` |
| Agent System | Agent attribution on completed tasks | Spec Renderer reads from task metadata |

---

## Accessibility

- All clause cards are focusable with `tabindex="0"` and carry `role="article"`
- Status indicators have `aria-label` descriptions (e.g. "Requirement REQ-001: Satisfied")
- Progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Section navigation uses `role="navigation"` with `aria-label="Design sections"`
- Mermaid diagrams include `aria-label` with the source code as fallback text
- Task checkboxes use `role="checkbox"` with `aria-checked`
- Keyboard: `Enter` toggles task expansion, `Space` (no-op on read-only clauses)
