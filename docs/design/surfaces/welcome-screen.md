# Welcome Screen

**Surface:** #7 of 8
**Priority:** Medium
**Status:** Draft
**Date:** 2026-03-10
**Tier:** 1 (new files) + Tier 2 (rewrite existing welcome contribution)

---

## Overview

The Welcome Screen replaces VS Code's stock welcome experience with a branded, purpose-built cold-start surface. It is shown when Son of Anton launches without a workspace. The screen communicates the product identity immediately: dark canvas, amber wordmark, and two clear paths forward.

The existing `SessionsWelcomeContribution` in `src/vs/sessions/contrib/welcome/browser/welcome.contribution.ts` handles sign-in/setup flows. The new Welcome Screen replaces the visual presentation while preserving the setup orchestration logic.

---

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--soa-bg-canvas` | `#0D0D0D` | Full-canvas background |
| `--soa-amber` | `#F5A623` | Wordmark, button borders, button text |
| `--soa-amber-hover` | `rgba(245, 166, 35, 0.10)` | Button hover background |
| `--soa-text-primary` | `#E8E8E8` | Recent project paths |
| `--soa-text-secondary` | `#888888` | Subtitle, status labels |
| `--soa-text-muted` | `#555555` | Timestamps |
| `--soa-bg-hover` | `#1A1A1A` | Recent project hover |
| `--soa-font-prose` | `'Geist', sans-serif` | All text |
| `--soa-font-mono` | `'Geist Mono', monospace` | Paths, version, costs |

---

## Layout

Full-canvas dark layout. No sidebar, no panel, no activity bar, no VS Code chrome.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                                                                          │
│                                                                          │
│                                                                          │
│                                                                          │
│                          Son of Anton                                    │
│                    Agentic development environment                       │
│                                                                          │
│                                                                          │
│                  ┌─────────────────┐  ┌─────────────────┐               │
│                  │  Open Project   │  │ New Agent Task   │               │
│                  └─────────────────┘  └─────────────────┘               │
│                                                                          │
│                                                                          │
│                  ~/Projects/son-of-anton          2 hours ago            │
│                  ~/Projects/my-app                yesterday              │
│                  ~/Projects/api-service           3 days ago             │
│                  ~/Projects/design-system         last week              │
│                                                                          │
│                                                                          │
│                                                                          │
│  Memory: 1,240 nodes · 3 graphs                   v2.0.0 · $0.00 spent │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Visual Specifications

### Wordmark

- **Text:** `Son of Anton`
- **Font:** `Geist`, weight `600`
- **Size:** `36px`
- **Colour:** `#F5A623`
- **Letter spacing:** `+0.05em`
- **Margin bottom:** `8px`
- **Text rendering:** `optimizeLegibility`

### Subtitle

- **Text:** `Agentic development environment`
- **Font:** `Geist`, weight `400`
- **Size:** `16px`
- **Colour:** `#888888`
- **Margin bottom:** `48px`

### Primary Action Buttons

Two buttons side-by-side, horizontally centred, `16px` gap between them.

| Property | Value |
|----------|-------|
| Border | `1px solid #F5A623` |
| Background | `transparent` |
| Text colour | `#F5A623` |
| Font | `Geist`, weight `500`, `14px` |
| Padding | `10px 28px` |
| Border radius | `6px` |
| Min width | `160px` |
| Cursor | `pointer` |
| Transition | `background-color 150ms ease` |

**Hover state:**
- Background: `rgba(245, 166, 35, 0.10)`
- Border: `1px solid #F5A623` (unchanged)
- Text: `#F5A623` (unchanged)

**Focus state:**
- `outline: 2px solid #F5A623`
- `outline-offset: 2px`

**Active state:**
- Background: `rgba(245, 166, 35, 0.15)`

#### Button Actions

| Button | Label | Action |
|--------|-------|--------|
| Open Project | `Open Project` | Opens native folder picker via `IFileDialogService.showOpenDialog()` |
| New Agent Task | `New Agent Task` | Opens Mission Control with task creation panel focused. Falls back to chat input if Mission Control is not yet implemented. |

### Recent Projects List

Positioned below buttons with `40px` top margin. Maximum 8 entries. Vertically stacked.

| Property | Value |
|----------|-------|
| Container max width | `480px` |
| Row height | `36px` |
| Row padding | `8px 12px` |
| Row border radius | `4px` |
| Path font | `Geist Mono`, `13px`, `#E8E8E8` |
| Timestamp font | `Geist`, `12px`, `#555555` |
| Layout | Flex row, `space-between` |
| Hover background | `#1A1A1A` |
| Transition | `background-color 100ms ease` |

Path display:
- Use `~` prefix for home directory
- Truncate from the left if path exceeds available width, showing `.../<last-two-segments>`
- On click: open the workspace via `IWorkspacesService.openWorkspace()`

Timestamp display:
- Relative format: `2 hours ago`, `yesterday`, `3 days ago`, `last week`, `2 weeks ago`
- Aligned to the right edge of the row

If no recent projects exist, show placeholder text:
- `No recent projects` in `#555555`, `13px`, centred

### Status Bar (Bottom)

Two pieces of information anchored to the bottom of the canvas:

#### Bottom Left: Memory Status

- **Position:** `bottom: 24px`, `left: 32px`
- **Font:** `Geist Mono`, `12px`, `#555555`
- **Format:** `Memory: {node_count} nodes · {graph_count} graphs`
- **Source:** Reads from the graph service health endpoint (or shows `Memory: offline` if unavailable)

#### Bottom Right: Version and Session Cost

- **Position:** `bottom: 24px`, `right: 32px`
- **Font:** `Geist Mono`, `12px`, `#555555`
- **Format:** `v{version} · ${cost} spent`
- **Version:** Read from `IProductService.version`
- **Cost:** Read from the session cost tracking service; starts at `$0.00`

---

## Behaviour

### Display Conditions

| Condition | Show Welcome? |
|-----------|---------------|
| Cold start, no workspace argument | Yes |
| Cold start with `--folder` or `--workspace` argument | No |
| User closes last workspace | Yes |
| User presses Escape on welcome screen | Dismiss, show empty editor area |
| User opens a project from welcome screen | Dismiss, open workspace |
| User creates a new agent task from welcome screen | Dismiss, switch to Mission Control |
| Application restarts with previously open workspace | No |

### No "Show on Startup" Checkbox

The VS Code default "Show welcome page on startup" checkbox is intentionally removed. The welcome screen is strictly tied to the no-workspace state. It cannot be disabled because it would leave the user facing a blank, unbranded canvas.

### Escape Behaviour

- `Escape` key dismisses the welcome screen with a fade-out animation (`opacity 0` over `200ms`)
- After dismissal, the standard empty editor group is shown
- The welcome screen does not reappear until the next cold start without a workspace

### Keyboard Navigation

- `Tab` cycles through: Open Project -> New Agent Task -> Recent project 1 -> ... -> Recent project N
- `Enter` activates the focused element
- `Escape` dismisses the screen

---

## Implementation

### Approach

Rewrite the visual layer of `SessionsWelcomeContribution`. The setup/sign-in orchestration logic is preserved; the overlay DOM and styling are replaced.

The existing `SessionsWelcomeOverlay` class renders a sign-in card. The new implementation replaces this with the branded welcome layout, showing the sign-in flow only when authentication is required (after the user clicks an action that needs it).

### Class Structure

```typescript
/**
 * The branded welcome screen shown on cold start without a workspace.
 */
class SonOfAntonWelcomeScreen extends Disposable {

	private readonly container: HTMLElement;

	constructor(
		parent: HTMLElement,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IRecentlyOpenedService private readonly recentlyOpenedService: IRecentlyOpenedService,
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.container = append(parent, $('.soa-welcome'));
		this.container.setAttribute('role', 'main');
		this.container.setAttribute('aria-label', localize('welcome.aria', "Son of Anton Welcome"));

		this._buildWordmark();
		this._buildActionButtons();
		this._buildRecentProjects();
		this._buildStatusBar();

		this._register(toDisposable(() => this.container.remove()));
	}

	private _buildWordmark(): void {
		const header = append(this.container, $('.soa-welcome-header'));
		append(header, $('h1.soa-welcome-wordmark', undefined, 'Son of Anton'));
		append(header, $('p.soa-welcome-subtitle', undefined,
			localize('welcome.subtitle', "Agentic development environment")
		));
	}

	private _buildActionButtons(): void {
		const actions = append(this.container, $('.soa-welcome-actions'));

		const openBtn = this._register(new Button(actions, {
			...soaOutlineButtonStyles,
		}));
		openBtn.label = localize('welcome.openProject', "Open Project");
		this._register(openBtn.onDidClick(() => this._openProject()));

		const taskBtn = this._register(new Button(actions, {
			...soaOutlineButtonStyles,
		}));
		taskBtn.label = localize('welcome.newTask', "New Agent Task");
		this._register(taskBtn.onDidClick(() => this._newAgentTask()));

		openBtn.focus();
	}

	private async _buildRecentProjects(): Promise<void> {
		const list = append(this.container, $('.soa-welcome-recent'));
		const recent = await this.recentlyOpenedService.getRecentlyOpened();
		const workspaces = recent.workspaces.slice(0, 8);

		if (workspaces.length === 0) {
			append(list, $('p.soa-welcome-no-recent', undefined,
				localize('welcome.noRecent', "No recent projects")
			));
			return;
		}

		for (const entry of workspaces) {
			const row = append(list, $('.soa-welcome-recent-row'));
			const path = append(row, $('span.soa-welcome-recent-path'));
			path.textContent = this._formatPath(entry);
			const time = append(row, $('span.soa-welcome-recent-time'));
			time.textContent = this._formatRelativeTime(entry);

			this._register(addDisposableListener(row, 'click', () => {
				this.workspacesService.openWorkspace(entry);
			}));
		}
	}

	private _buildStatusBar(): void {
		const bar = append(this.container, $('.soa-welcome-statusbar'));

		const left = append(bar, $('span.soa-welcome-status-left'));
		left.textContent = localize('welcome.memoryOffline', "Memory: offline");

		const right = append(bar, $('span.soa-welcome-status-right'));
		const version = this.productService.version ?? '0.0.0';
		right.textContent = `v${version} \u00B7 $0.00 spent`;
	}

	dismiss(): void {
		this.container.classList.add('soa-welcome-dismissed');
		const handle = setTimeout(() => this.dispose(), 200);
		this._register(toDisposable(() => clearTimeout(handle)));
	}
}
```

### Button Styles

```typescript
const soaOutlineButtonStyles: IButtonStyles = {
	buttonBackground: Color.transparent.toString(),
	buttonForeground: '#F5A623',
	buttonBorder: '#F5A623',
	buttonHoverBackground: 'rgba(245, 166, 35, 0.10)',
	buttonSecondaryBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSeparator: undefined,
};
```

### CSS

```css
/* welcome-screen.css */

.soa-welcome {
	position: absolute;
	inset: 0;
	background: #0D0D0D;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	z-index: 1000;
	font-family: 'Geist', sans-serif;
	transition: opacity 200ms ease;
}

.soa-welcome-dismissed {
	opacity: 0;
	pointer-events: none;
}

/* Wordmark */
.soa-welcome-wordmark {
	font-size: 36px;
	font-weight: 600;
	color: #F5A623;
	letter-spacing: 0.05em;
	text-rendering: optimizeLegibility;
	margin: 0 0 8px 0;
	text-align: center;
}

.soa-welcome-subtitle {
	font-size: 16px;
	font-weight: 400;
	color: #888888;
	margin: 0 0 48px 0;
	text-align: center;
}

/* Action buttons */
.soa-welcome-actions {
	display: flex;
	gap: 16px;
	margin-bottom: 40px;
}

.soa-welcome-actions .monaco-button {
	min-width: 160px;
	padding: 10px 28px;
	border: 1px solid #F5A623;
	border-radius: 6px;
	background: transparent;
	color: #F5A623;
	font-family: 'Geist', sans-serif;
	font-weight: 500;
	font-size: 14px;
	cursor: pointer;
	transition: background-color 150ms ease;
}

.soa-welcome-actions .monaco-button:hover {
	background: rgba(245, 166, 35, 0.10);
}

.soa-welcome-actions .monaco-button:active {
	background: rgba(245, 166, 35, 0.15);
}

.soa-welcome-actions .monaco-button:focus-visible {
	outline: 2px solid #F5A623;
	outline-offset: 2px;
}

/* Recent projects */
.soa-welcome-recent {
	max-width: 480px;
	width: 100%;
}

.soa-welcome-recent-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	height: 36px;
	padding: 8px 12px;
	border-radius: 4px;
	cursor: pointer;
	transition: background-color 100ms ease;
}

.soa-welcome-recent-row:hover {
	background: #1A1A1A;
}

.soa-welcome-recent-path {
	font-family: 'Geist Mono', monospace;
	font-size: 13px;
	color: #E8E8E8;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1;
	margin-right: 16px;
}

.soa-welcome-recent-time {
	font-family: 'Geist', sans-serif;
	font-size: 12px;
	color: #555555;
	white-space: nowrap;
	flex-shrink: 0;
}

.soa-welcome-no-recent {
	font-size: 13px;
	color: #555555;
	text-align: center;
	margin: 0;
}

/* Status bar */
.soa-welcome-statusbar {
	position: absolute;
	bottom: 24px;
	left: 32px;
	right: 32px;
	display: flex;
	justify-content: space-between;
}

.soa-welcome-status-left,
.soa-welcome-status-right {
	font-family: 'Geist Mono', monospace;
	font-size: 12px;
	color: #555555;
}
```

---

## Interfaces

```typescript
/**
 * Configuration for the welcome screen display.
 */
export interface IWelcomeScreenConfig {
	/** Whether to show the memory status in the bottom bar */
	readonly showMemoryStatus: boolean;
	/** Whether to show the session cost tracker */
	readonly showSessionCost: boolean;
	/** Maximum number of recent projects to display */
	readonly maxRecentProjects: number;
}

/**
 * A recent project entry for display on the welcome screen.
 */
export interface IRecentProjectEntry {
	/** Display path (shortened with ~ for home dir) */
	readonly displayPath: string;
	/** Full URI for opening */
	readonly uri: URI;
	/** Last opened timestamp */
	readonly lastOpened: number;
	/** Relative time string for display */
	readonly relativeTime: string;
}

/**
 * Memory status from the graph service.
 */
export interface IMemoryStatus {
	/** Whether the graph service is reachable */
	readonly online: boolean;
	/** Total number of nodes across all graphs */
	readonly nodeCount: number;
	/** Number of active graphs */
	readonly graphCount: number;
}

/**
 * Session cost tracking.
 */
export interface ISessionCost {
	/** Total cost in USD for the current session */
	readonly totalUsd: number;
	/** Formatted cost string (e.g. "$1.23") */
	readonly formatted: string;
}

/**
 * Service for the welcome screen state.
 */
export interface IWelcomeScreenService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the current memory status from the graph service.
	 */
	getMemoryStatus(): Promise<IMemoryStatus>;

	/**
	 * Get the current session cost.
	 */
	getSessionCost(): ISessionCost;

	/**
	 * Get recent projects formatted for display.
	 */
	getRecentProjects(limit: number): Promise<IRecentProjectEntry[]>;
}
```

---

## File Locations

Tier 2 modification: rewriting the existing welcome contribution.

```
src/vs/sessions/contrib/welcome/
  browser/
    welcome.contribution.ts            — REWRITE: replace overlay with branded welcome screen
    welcomeScreen.ts                   — NEW: SonOfAntonWelcomeScreen class
    welcomeScreenService.ts            — NEW: IWelcomeScreenService implementation
    media/
      welcomeOverlay.css               — REWRITE: replace with branded styles
      welcome-screen.css               — NEW: welcome screen styles (if separate from overlay)
  common/
    welcomeScreen.ts                   — NEW: interfaces (IWelcomeScreenConfig, etc.)
  test/
    browser/
      welcomeScreen.test.ts            — NEW: welcome screen unit tests
```

---

## Integration Points

| System | Integration | Direction |
|--------|-------------|-----------|
| File Dialog Service | Opens native folder picker for "Open Project" | Welcome Screen calls `IFileDialogService` |
| Workspaces Service | Opens selected workspace | Welcome Screen calls `IWorkspacesService` |
| Recently Opened Service | Reads recent workspace list | Welcome Screen reads from `IRecentlyOpenedService` |
| Product Service | Reads version string | Welcome Screen reads from `IProductService` |
| Graph Service | Reads memory/node stats for status bar | Welcome Screen calls graph health endpoint |
| Session Cost Service | Reads session cost for status bar | Welcome Screen reads from cost tracker |
| Mission Control | "New Agent Task" navigates to Mission Control | Welcome Screen triggers mode switch |
| Chat Entitlement | Setup flow triggers if auth is needed | Existing `SessionsWelcomeContribution` logic preserved |
| Layout Service | Controls chrome visibility during welcome | Welcome Screen hides sidebar/panel/activity bar |

---

## Accessibility

- Welcome screen container uses `role="main"` with `aria-label="Son of Anton Welcome"`
- Wordmark uses `<h1>` for document structure
- Action buttons are standard `<button>` elements with visible labels
- Recent project rows use `role="listitem"` within a `role="list"` container
- Focus order follows visual order: wordmark (skipped) -> Open Project -> New Agent Task -> recent projects
- `Escape` key dismissal announced via `aria-live="polite"` region
- Status bar items use `aria-label` for screen reader descriptions (e.g. "Graph memory: 1,240 nodes in 3 graphs")
- All interactive elements have visible focus indicators (`2px solid #F5A623`)
- Colour choices meet WCAG 2.1 AA contrast for text on `#0D0D0D`: `#F5A623` = 8.2:1, `#E8E8E8` = 15.4:1, `#888888` = 5.0:1, `#555555` = 2.8:1 (decorative timestamps only)
