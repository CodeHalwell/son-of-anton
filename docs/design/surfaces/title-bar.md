# Title Bar

> **Surface type:** Chrome
> **Modification tier:** Tier 2 (hooks into existing sessions TitlebarPart)
> **Status:** Design spec
> **Last updated:** 2026-03-10

## Motivation

The title bar is the first thing a user sees. On macOS, custom title bars are an immediate differentiator from stock VS Code. By surfacing live AI session metadata (active model, context consumption, cost, agent count) directly in the chrome, Son of Anton signals its AI-native identity without requiring the user to open any panel.

This is a high-return, low-effort surface. The sessions workbench already has a custom `TitlebarPart` (`src/vs/sessions/browser/parts/titlebarPart.ts`) with left/center/right sections driven by menus. The work is adding four new right-side widgets and applying the Son of Anton dark + amber aesthetic.

---

## Layout

```
+--[traffic lights]----[           Son of Anton           ]----[model][ctx][cost][agents]--+
|  macOS standard      centre wordmark                         right-side widgets          |
+-----------------------------------------------------------------------------------------+
```

### Dimensions

| Property | Value |
|----------|-------|
| Height | 30px (matches `DEFAULT_CUSTOM_TITLEBAR_HEIGHT`) |
| Background | `#0A0A0A` (near-black, registered as `sonOfAntonTitleBar.background`) |
| Foreground | `#E0E0E0` (default text, registered as `sonOfAntonTitleBar.foreground`) |

### Left section

- **macOS traffic lights** inset at OS-standard position. The existing 70px spacer in `TitlebarPart.createContentArea()` already handles this.
- No additional left-side widgets. The left toolbar (`Menus.TitleBarLeftLayout`) remains as-is.

### Centre section

- **Wordmark:** `Son of Anton` rendered in [Geist](https://vercel.com/font) weight 500.
- Tracking (letter-spacing): `+0.05em`.
- Color: `#F5A623` (primary amber).
- The wordmark replaces the session picker when no session is active (i.e. when `SessionsWelcomeVisibleContext` is true). When a session is active, the existing `SessionsTitleBarWidget` renders in centre and the wordmark is hidden.
- Implementation: register a new menu item in `Menus.CommandCenter` with a custom `IActionViewItemService` renderer that returns a static `<span>` element, gated on `SessionsWelcomeVisibleContext`.

### Right section

Four widgets, rendered left-to-right within `Menus.TitleBarRightLayout` as action view items:

| Widget | Content | Color | Order |
|--------|---------|-------|-------|
| Model indicator | Active model slug (e.g. `claude-sonnet-4-6`, `ollama/qwen2.5`) | `#B8860B` (muted gold) | 1 |
| Context usage bar | Thin horizontal bar showing % of context window consumed | Amber fill `#F5A623` on `#1E1E1E` track | 2 |
| Cost ticker | `$X.XX` accumulated session cost | `#B8860B` | 3 |
| Agent count badge | Circular badge with count of active agents | `#F5A623` text on `#1E1E1E` background | 4 |

All four widgets are hidden when `SessionsWelcomeVisibleContext` is true (no active session).

---

## Visual Design

### Color tokens

Register in `src/vs/sessions/common/theme.ts`:

```typescript
export const sonOfAntonTitleBarBackground = registerColor(
	'sonOfAntonTitleBar.background',
	{ dark: '#0A0A0A', light: '#F5F5F5', hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('sonOfAntonTitleBar.background', 'Background color of the Son of Anton title bar.')
);

export const sonOfAntonTitleBarForeground = registerColor(
	'sonOfAntonTitleBar.foreground',
	{ dark: '#E0E0E0', light: '#1E1E1E', hcDark: '#FFFFFF', hcLight: '#000000' },
	localize('sonOfAntonTitleBar.foreground', 'Foreground color of the Son of Anton title bar.')
);

export const sonOfAntonTitleBarAccent = registerColor(
	'sonOfAntonTitleBar.accent',
	{ dark: '#F5A623', light: '#B8860B', hcDark: '#FFD700', hcLight: '#8B6914' },
	localize('sonOfAntonTitleBar.accent', 'Accent color (amber/gold) used for the wordmark and highlights in the title bar.')
);

export const sonOfAntonTitleBarMutedAccent = registerColor(
	'sonOfAntonTitleBar.mutedAccent',
	{ dark: '#B8860B', light: '#8B6914', hcDark: '#DAA520', hcLight: '#6B4F0A' },
	localize('sonOfAntonTitleBar.mutedAccent', 'Muted gold color for model indicator and cost ticker.')
);
```

### Typography

| Element | Font | Weight | Size | Letter-spacing |
|---------|------|--------|------|----------------|
| Wordmark | Geist | 500 | 13px | 0.05em |
| Model indicator | System (Geist fallback) | 400 | 11px | normal |
| Cost ticker | System monospace | 400 | 11px | normal |
| Agent badge | System | 600 | 10px | normal |

### Context usage bar

- Width: 60px
- Height: 4px
- Border-radius: 2px
- Track: `#1E1E1E`
- Fill: `#F5A623`, width = `percentage%`
- Fill transitions smoothly with `transition: width 300ms ease`
- When usage > 80%: fill color shifts to `#E04040` (red warning)

---

## Data Sources

| Widget | Source | Update frequency |
|--------|--------|-----------------|
| Model indicator | LLM provider's active model ID. Read from the chat model's `languageModelId` property via `IChatService`. Falls back to configuration `chat.agent.defaultModel`. | On session switch, on model change |
| Context usage bar | Token counter in the agent manager. Read `currentTokens / maxTokens` from the active chat model's token tracking. | After each request/response cycle |
| Cost ticker | Metrics tracker service. Accumulated `inputTokens * inputPrice + outputTokens * outputPrice` for the session. | After each LLM response |
| Agent count | Mission control task list. Count of tasks with status `running` or `pending` from `IAgentSessionsService`. | On task state change |

---

## Interfaces

```typescript
/**
 * State rendered by the title bar widgets. Aggregated by the
 * TitleBarStateService from underlying services.
 */
export interface ITitleBarState {
	/** Slug of the active LLM model (e.g. 'claude-sonnet-4-6'). */
	readonly activeModel: string | undefined;

	/**
	 * Context window usage as a ratio 0..1.
	 * undefined when no session is active.
	 */
	readonly contextUsage: number | undefined;

	/**
	 * Accumulated cost in USD for the current session.
	 * undefined when cost tracking is unavailable.
	 */
	readonly sessionCost: number | undefined;

	/** Number of agents currently running. */
	readonly activeAgentCount: number;
}

/**
 * Service identifier for the title bar state aggregator.
 */
export const ITitleBarStateService = createDecorator<ITitleBarStateService>('sonOfAntonTitleBarStateService');

export interface ITitleBarStateService {
	readonly _serviceBrand: undefined;

	/** Observable title bar state. */
	readonly state: IObservable<ITitleBarState>;

	/** Fired when any component of the state changes. */
	readonly onDidChange: Event<ITitleBarState>;
}
```

---

## Implementation Plan

### File locations

```
src/vs/sessions/contrib/titleBarWidgets/browser/
  titleBarStateService.ts      // ITitleBarStateService implementation
  modelIndicatorWidget.ts      // Model indicator action view item
  contextUsageWidget.ts        // Context usage bar action view item
  costTickerWidget.ts          // Cost ticker action view item
  agentCountWidget.ts          // Agent count badge action view item
  wordmarkWidget.ts            // Centre wordmark renderer
  titleBarWidgets.contribution.ts  // Registers all widgets
  media/
    titleBarWidgets.css        // Styles for all four widgets + wordmark
```

### Step 1: Register color tokens

Add the four color tokens to `src/vs/sessions/common/theme.ts` as shown above.

### Step 2: Create `ITitleBarStateService`

- Inject `IChatService`, `IAgentSessionsService`, `ISessionsManagementService`.
- Use `autorun` to listen to the active session observable.
- Expose state as an `IObservable<ITitleBarState>`.
- Register as a session-scoped service.

### Step 3: Build widget action view items

Each widget extends `BaseActionViewItem` (same pattern as `SessionsTitleBarWidget`):

- **ModelIndicatorWidget**: Renders a `<span>` with the model slug. Listens to `ITitleBarStateService.onDidChange`.
- **ContextUsageWidget**: Renders a `<div>` track + inner fill bar. Updates fill width on state change.
- **CostTickerWidget**: Renders `$0.00` formatted via `Intl.NumberFormat`. Updates on state change.
- **AgentCountWidget**: Renders a circular badge. Hidden when count is 0.

### Step 4: Register menu items and action view items

In `titleBarWidgets.contribution.ts`:

```typescript
// Register four actions in Menus.TitleBarRightLayout
this._register(MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
	command: { id: 'sonOfAnton.titleBar.modelIndicator', title: 'Model' },
	group: 'z_sonOfAnton',
	order: 1,
	when: SessionsWelcomeVisibleContext.negate()
}));
// ... repeat for contextUsage (order 2), costTicker (order 3), agentCount (order 4)

// Register custom renderers via IActionViewItemService
this._register(actionViewItemService.register(
	Menus.TitleBarRightLayout,
	'sonOfAnton.titleBar.modelIndicator',
	(action, options) => instantiationService.createInstance(ModelIndicatorWidget, action, options),
	undefined
));
// ... repeat for each widget
```

### Step 5: Apply dark background

Override `chatBarTitleBackground` in the Son of Anton theme to `#0A0A0A`, or apply the `sonOfAntonTitleBarBackground` token in `TitlebarPart.updateStyles()`. The existing `updateStyles()` method in `src/vs/sessions/browser/parts/titlebarPart.ts` already reads `chatBarTitleBackground` -- register `sonOfAntonTitleBarBackground` as the default value for that token.

### Step 6: CSS

```css
/* Wordmark */
.son-of-anton-wordmark {
	font-family: 'Geist', system-ui, sans-serif;
	font-weight: 500;
	font-size: 13px;
	letter-spacing: 0.05em;
	color: var(--vscode-sonOfAntonTitleBar-accent);
	user-select: none;
	-webkit-app-region: drag;
}

/* Right-side widgets shared */
.titlebar-right .son-of-anton-widget {
	display: flex;
	align-items: center;
	height: 100%;
	padding: 0 6px;
	font-size: 11px;
	color: var(--vscode-sonOfAntonTitleBar-mutedAccent);
	-webkit-app-region: no-drag;
}

/* Context usage bar */
.son-of-anton-context-bar {
	width: 60px;
	height: 4px;
	border-radius: 2px;
	background: #1E1E1E;
	overflow: hidden;
}

.son-of-anton-context-bar .fill {
	height: 100%;
	border-radius: 2px;
	background: var(--vscode-sonOfAntonTitleBar-accent);
	transition: width 300ms ease;
}

.son-of-anton-context-bar .fill.warning {
	background: #E04040;
}

/* Agent count badge */
.son-of-anton-agent-badge {
	min-width: 16px;
	height: 16px;
	border-radius: 8px;
	background: #1E1E1E;
	color: var(--vscode-sonOfAntonTitleBar-accent);
	font-size: 10px;
	font-weight: 600;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 4px;
}

/* Cost ticker monospace */
.son-of-anton-cost-ticker {
	font-family: 'Geist Mono', 'SF Mono', 'Cascadia Code', monospace;
}
```

---

## Accessibility

- All widgets must have `aria-label` attributes describing their content (e.g. `"Active model: claude-sonnet-4-6"`).
- The context usage bar must have `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.
- The agent count badge must use `aria-live="polite"` so screen readers announce changes.
- High-contrast themes must use the `hcDark` / `hcLight` color token overrides defined above.
- All interactive elements must be keyboard-focusable and respond to Enter/Space.

---

## Testing

- **Unit tests** for `TitleBarStateService`: verify state aggregation from mock services, verify update events fire correctly.
- **Snapshot tests** for each widget: render with known state, assert DOM structure via `assert.deepStrictEqual`.
- **Integration tests**: verify widgets appear/disappear based on `SessionsWelcomeVisibleContext`.
- Test file location: `src/vs/sessions/contrib/titleBarWidgets/test/browser/`

---

## Open Questions

1. **Font loading:** Geist is not bundled with VS Code. Should we bundle it as a static asset in `resources/` or fall back to system fonts until the services layer loads a web font?
2. **Cost precision:** Should the cost ticker show two decimal places always, or switch to four decimals for sub-cent sessions?
3. **Multi-model sessions:** If an agent session uses model routing (Opus for planning, Sonnet for generation), should the model indicator show the most recent model or the orchestrator model?
