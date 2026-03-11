# Terminal Blocks

> **Surface type:** Terminal UI
> **Modification tier:** Tier 2 (contribution into sessions terminal layer)
> **Status:** Design spec
> **Last updated:** 2026-03-10

## Motivation

The standard terminal is a flat, undifferentiated stream of text. In an AI-native IDE, the terminal is a first-class collaboration surface -- agents run commands, inspect build output, and execute tests alongside the developer. Without visual structure, it is impossible to tell which commands were human-initiated, which were agent-initiated, what the cost was, and where to checkpoint or revert.

Terminal Blocks reimagine the terminal as a semantic, block-based interface (inspired by [Warp](https://warp.dev)). Each command + output group is a discrete visual block with agent attribution, collapsible output, and one-click actions.

The existing `SessionsTerminalContribution` (`src/vs/sessions/contrib/terminal/browser/sessionsTerminalContribution.ts`) manages terminal lifecycle per session. Terminal Blocks layer on top of this, parsing output into semantic blocks and rendering overlays.

---

## Block Types

| Type | Left border color | Label | When |
|------|------------------|-------|------|
| Manual command | `#3A3A3A` (grey) | None | User typed a command |
| Agent-originated | `#F5A623` (amber) | Agent name + model slug | Agent executed a command via tool use |
| Build/test pass | `#2A5A2A` (green) | `Pass` | Exit code 0 on build/test command |
| Build/test fail | `#5A2A2A` (red) | `Fail` | Non-zero exit code on build/test command |
| Checkpoint marker | `#B8860B` (muted gold) | Snapshot ID | User or agent created a checkpoint |

### Detection heuristics

- **Manual vs. agent:** Agent-originated commands are tagged via a side-channel from the agent manager (see Agent Attribution below). All untagged commands are manual.
- **Build/test classification:** Match the command text against known patterns (`npm test`, `npm run build`, `make`, `cargo test`, `pytest`, `go test`, etc.) or rely on task definitions. Extensible via configuration.
- **Pass/fail:** Determined by exit code from `TerminalCapability.CommandDetection`.

---

## Block Structure

Each block groups a command input line and its output into a single visual unit:

```
+---+------------------------------------------------------------------+
| B |  $ npm test                                        [timestamp]   |
| O |                                                                  |
| R |  > son-of-anton@1.0.0 test                         [collapsed]  |
| D |  > ...5 more lines                                               |
| E |                                                                  |
| R |  [agent: code-review-agent / claude-sonnet-4-6]  [$0.012]       |
+---+------------------------------------------------------------------+
```

### Collapse behaviour

- **Default:** Collapsed to first 5 lines of output. The command line is always visible.
- **Expand:** Click the block or press Enter when focused to expand full output.
- **Auto-expand:** Blocks with fewer than 5 lines of output are shown fully expanded.
- **Error auto-expand:** Blocks with non-zero exit code auto-expand to show the full error.

### Metadata bar

A thin footer bar within each block, visible on hover or when the block is focused:

| Field | Source | Format |
|-------|--------|--------|
| Agent name | Side-channel attribution | `code-review-agent` |
| Model slug | Attribution metadata | `claude-sonnet-4-6` |
| Token cost | Attribution metadata | `$0.012` |
| Timestamp | `CommandDetection.timestamp` | `HH:MM:SS` relative or absolute |
| Duration | `CommandDetection` start/end | `2.3s` |

### One-click actions

Appear on hover at the right edge of the block header:

| Action | Icon | Behaviour |
|--------|------|-----------|
| Copy output | `Codicon.copy` | Copy block output to clipboard |
| Checkpoint from here | `Codicon.bookmark` | Create a git checkpoint at this command's state |
| Revert to this state | `Codicon.discard` | Revert worktree to the checkpoint before this block |
| Re-run command | `Codicon.refresh` | Re-execute the command in the terminal |
| Send to chat | `Codicon.comment` | Attach block output as context in the chat panel |

---

## Visual Design

### Color tokens

Register in `src/vs/sessions/common/theme.ts`:

```typescript
export const terminalBlockBackground = registerColor(
	'terminalBlock.background',
	{ dark: '#0D0D0D', light: '#FAFAFA', hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('terminalBlock.background', 'Background color of a terminal block.')
);

export const terminalBlockSeparator = registerColor(
	'terminalBlock.separator',
	{ dark: '#1E1E1E', light: '#E0E0E0', hcDark: contrastBorder, hcLight: contrastBorder },
	localize('terminalBlock.separator', 'Separator line between terminal blocks.')
);

export const terminalBlockMetadataBackground = registerColor(
	'terminalBlock.metadataBackground',
	{ dark: '#161616', light: '#F0F0F0', hcDark: '#0A0A0A', hcLight: '#F5F5F5' },
	localize('terminalBlock.metadataBackground', 'Background of the metadata bar in a terminal block.')
);

export const terminalBlockBorderManual = registerColor(
	'terminalBlock.borderManual',
	{ dark: '#3A3A3A', light: '#C0C0C0', hcDark: '#808080', hcLight: '#808080' },
	localize('terminalBlock.borderManual', 'Left border color for manually entered terminal commands.')
);

export const terminalBlockBorderAgent = registerColor(
	'terminalBlock.borderAgent',
	{ dark: '#F5A623', light: '#B8860B', hcDark: '#FFD700', hcLight: '#8B6914' },
	localize('terminalBlock.borderAgent', 'Left border color for agent-originated terminal commands.')
);

export const terminalBlockBorderPass = registerColor(
	'terminalBlock.borderPass',
	{ dark: '#2A5A2A', light: '#2A7A2A', hcDark: '#00FF00', hcLight: '#006600' },
	localize('terminalBlock.borderPass', 'Left border color for passing build/test blocks.')
);

export const terminalBlockBorderFail = registerColor(
	'terminalBlock.borderFail',
	{ dark: '#5A2A2A', light: '#7A2A2A', hcDark: '#FF0000', hcLight: '#660000' },
	localize('terminalBlock.borderFail', 'Left border color for failing build/test blocks.')
);

export const terminalBlockBorderCheckpoint = registerColor(
	'terminalBlock.borderCheckpoint',
	{ dark: '#B8860B', light: '#8B6914', hcDark: '#DAA520', hcLight: '#6B4F0A' },
	localize('terminalBlock.borderCheckpoint', 'Left border color for checkpoint marker blocks.')
);
```

### Layout dimensions

| Property | Value |
|----------|-------|
| Block background | `#0D0D0D` |
| Block separator | 1px solid `#1E1E1E` |
| Left border | 3px solid, colored by block type |
| Block padding | 8px 12px |
| Metadata bar height | 24px |
| Metadata bar background | `#161616` |
| Metadata text color | `#808080` (muted) |
| Metadata text size | 11px |

### Hover state

- Left border brightens by 30% (e.g. `#3A3A3A` -> `#5A5A5A` for manual blocks).
- Metadata bar slides in from hidden (opacity 0 -> 1, height 0 -> 24px, 150ms ease).
- One-click action buttons appear at block header right edge.

### Focus state

- 1px outline in `#F5A623` around the entire block.
- Metadata bar is visible (same as hover).
- Arrow keys navigate between blocks.

---

## Agent Attribution

Agent-originated commands need a side-channel to carry attribution metadata from the agent manager to the terminal block renderer.

### Option A: Special escape sequences (preferred)

Define a custom OSC (Operating System Command) escape sequence:

```
ESC ] 7770 ; <JSON payload> ST
```

Where the JSON payload is:

```json
{
	"agentName": "code-review-agent",
	"modelId": "claude-sonnet-4-6",
	"tokenCost": 0.012,
	"taskId": "task-abc-123"
}
```

The agent manager writes this escape sequence to the terminal's stdin immediately before writing the command. The block renderer's parser strips the escape sequence from visible output and attaches the metadata to the next detected command block.

### Option B: Side-channel registry

The agent manager registers pending attributions with `ITerminalBlockService` keyed by terminal instance ID + command index. When `CommandDetection` fires for a new command, the block service checks the registry for a matching attribution.

Option A is preferred because it works across pty boundaries and does not require synchronization between the agent execution and command detection timing.

---

## Interfaces

```typescript
/**
 * Represents a single terminal block -- a command and its output
 * grouped as a semantic unit.
 */
export interface ITerminalBlock {
	/** Unique block identifier. */
	readonly id: string;

	/** Block type determines visual treatment. */
	readonly type: TerminalBlockType;

	/** The command string that was executed. */
	readonly command: string;

	/** Full output text of the command. */
	readonly output: string;

	/** Number of output lines (for collapse threshold). */
	readonly outputLineCount: number;

	/** Exit code, if available. */
	readonly exitCode: number | undefined;

	/** Agent name if this was an agent-originated command. */
	readonly agentName: string | undefined;

	/** Model ID used by the agent for this command. */
	readonly modelId: string | undefined;

	/** Token cost in USD for the agent operation that generated this command. */
	readonly tokenCost: number | undefined;

	/** Timestamp when the command started. */
	readonly timestamp: number;

	/** Duration in milliseconds. */
	readonly duration: number | undefined;

	/** Checkpoint/snapshot ID if one was created at this point. */
	readonly checkpointId: string | undefined;

	/** Whether the block is currently expanded. */
	expanded: boolean;
}

export const enum TerminalBlockType {
	Manual = 'manual',
	Agent = 'agent',
	BuildPass = 'buildPass',
	BuildFail = 'buildFail',
	Checkpoint = 'checkpoint',
}

/**
 * Service that manages terminal blocks for a terminal instance.
 * One instance per terminal.
 */
export const ITerminalBlockService = createDecorator<ITerminalBlockService>('terminalBlockService');

export interface ITerminalBlockService {
	readonly _serviceBrand: undefined;

	/** All blocks for the active terminal, ordered chronologically. */
	readonly blocks: IObservable<readonly ITerminalBlock[]>;

	/** Fired when a new block is created. */
	readonly onBlockCreated: Event<ITerminalBlock>;

	/** Fired when a block is updated (e.g. output appended, exit code set). */
	readonly onBlockUpdated: Event<ITerminalBlock>;

	/** Fired when a block's expanded state changes. */
	readonly onBlockToggled: Event<ITerminalBlock>;

	/**
	 * Register an agent attribution for the next command in the given
	 * terminal instance.
	 */
	registerAttribution(terminalInstanceId: number, attribution: ITerminalBlockAttribution): void;

	/**
	 * Toggle the expanded state of a block.
	 */
	toggleBlock(blockId: string): void;

	/**
	 * Get all blocks for a specific terminal instance.
	 */
	getBlocksForTerminal(terminalInstanceId: number): readonly ITerminalBlock[];

	/**
	 * Create a checkpoint marker block.
	 */
	createCheckpoint(terminalInstanceId: number, checkpointId: string): ITerminalBlock;
}

/**
 * Attribution metadata attached to agent-originated commands.
 */
export interface ITerminalBlockAttribution {
	readonly agentName: string;
	readonly modelId: string;
	readonly tokenCost: number | undefined;
	readonly taskId: string | undefined;
}

/**
 * Actions available on a terminal block.
 */
export interface ITerminalBlockActions {
	copyOutput(block: ITerminalBlock): Promise<void>;
	checkpointFromHere(block: ITerminalBlock): Promise<void>;
	revertToState(block: ITerminalBlock): Promise<void>;
	rerunCommand(block: ITerminalBlock): Promise<void>;
	sendToChat(block: ITerminalBlock): Promise<void>;
}
```

---

## Implementation Plan

### File locations

```
src/vs/sessions/contrib/terminalBlocks/browser/
  terminalBlockService.ts              // ITerminalBlockService implementation
  terminalBlockRenderer.ts            // DOM rendering of blocks as overlays
  agentAttribution.ts                 // OSC escape sequence parser + attribution registry
  terminalBlockActions.ts             // One-click action implementations
  terminalBlocks.contribution.ts      // Registers contribution, menus, keybindings
  media/
    terminalBlocks.css                // All block styles
src/vs/sessions/contrib/terminalBlocks/common/
  terminalBlock.ts                    // ITerminalBlock, TerminalBlockType, interfaces
src/vs/sessions/contrib/terminalBlocks/test/browser/
  terminalBlockService.test.ts        // Unit tests for block service
  agentAttribution.test.ts            // Unit tests for OSC parser
  terminalBlockRenderer.test.ts       // Snapshot tests for rendered DOM
```

### Step 1: Define interfaces and types

Create `terminalBlock.ts` in `common/` with all interfaces listed above.

### Step 2: Implement `ITerminalBlockService`

- Inject `ITerminalService` to access terminal instances.
- For each terminal instance, listen to `TerminalCapability.CommandDetection` events.
- On each detected command:
  1. Create a new `ITerminalBlock` with the command text.
  2. Check the attribution registry for a pending attribution matching this terminal + command index.
  3. Determine block type from command pattern matching and exit code.
  4. Emit `onBlockCreated`.
- On command completion (exit code available):
  1. Update the block with exit code, duration, and output.
  2. Re-classify block type if it was a build/test command (pass vs fail).
  3. Emit `onBlockUpdated`.

### Step 3: Implement agent attribution parser

```typescript
/**
 * Parse Son of Anton OSC escape sequences from terminal output.
 *
 * Format: ESC ] 7770 ; <JSON> ST
 *
 * The parser strips the escape sequence from visible output and
 * returns the parsed attribution metadata.
 */
export function parseAttributionOSC(data: string): {
	cleanData: string;
	attribution: ITerminalBlockAttribution | undefined;
} {
	const OSC_PREFIX = '\x1b]7770;';
	const ST = '\x1b\\';
	// ... parse and strip
}
```

Register an `ITerminalProcessDataEvent` handler on each terminal instance to intercept and parse OSC sequences before they reach the terminal renderer.

### Step 4: Implement block renderer

The block renderer is a `TerminalContribution` that overlays block decorations on the terminal viewport:

- Uses `CommandDetection` to know where each command starts and ends in the terminal buffer.
- Renders a left-border `<div>` absolutely positioned alongside each command region.
- Renders a metadata bar `<div>` below each command region (hidden by default, shown on hover).
- Renders collapse indicators and one-click action buttons.
- Listens to terminal scroll events to reposition overlays.

This is similar to how the terminal decorations API works (`IDecoration` in `xterm.js`) but with richer custom DOM.

### Step 5: Implement one-click actions

Each action is registered as an `Action2`:

| Action ID | Implementation |
|-----------|---------------|
| `terminalBlock.copyOutput` | `navigator.clipboard.writeText(block.output)` |
| `terminalBlock.checkpointFromHere` | Call git stash/commit via the agent session's SCM provider |
| `terminalBlock.revertToState` | Call git checkout/restore via SCM to the checkpoint ref |
| `terminalBlock.rerunCommand` | Write `block.command + '\n'` to the terminal instance's stdin |
| `terminalBlock.sendToChat` | Create a chat attachment with the block output via `IChatService` |

### Step 6: Register contribution

In `terminalBlocks.contribution.ts`:

```typescript
registerWorkbenchContribution2(
	'workbench.contrib.terminalBlocks',
	TerminalBlocksContribution,
	WorkbenchPhase.AfterRestored
);
```

Wire up the `ITerminalBlockService` and `TerminalBlockRenderer`. Register keybindings:

| Key | Action |
|-----|--------|
| `Enter` (when block focused) | Toggle expand/collapse |
| `ArrowUp` / `ArrowDown` | Navigate between blocks |
| `Cmd+Shift+C` (in block) | Copy block output |
| `Cmd+Shift+K` (in block) | Create checkpoint |

---

## Interaction with Existing Code

### `SessionsTerminalContribution`

The existing contribution (`src/vs/sessions/contrib/terminal/browser/sessionsTerminalContribution.ts`) manages terminal instance lifecycle (create, show, hide, close per session). Terminal Blocks does not replace this -- it layers on top. `ITerminalBlockService` is injected alongside the existing contribution.

### `TerminalCapability.CommandDetection`

Terminal Blocks depends heavily on command detection. If command detection is unavailable (e.g. shell integration not installed), blocks fall back to a single continuous block with no semantic boundaries. A notification should prompt the user to enable shell integration.

### Agent manager integration

The agent manager (in `son-of-anton-agents` repository) must be updated to:
1. Write the OSC attribution escape sequence before each terminal command.
2. Pass `agentName`, `modelId`, and `tokenCost` in the payload.

This is a cross-repository change but is isolated to the agent's terminal tool implementation.

---

## Accessibility

- Each block must have `role="region"` with `aria-label` describing the command and its status (e.g. `"Command: npm test, Status: Pass, Agent: code-review-agent"`).
- Collapsed blocks must announce their collapsed state (`aria-expanded="false"`).
- Block navigation via arrow keys must move focus and announce the new block.
- Metadata bar content must be readable by screen readers even when visually hidden (use `aria-describedby`).
- High-contrast themes must use `contrastBorder` for block borders and separators.
- One-click action buttons must have descriptive `aria-label` attributes.

---

## Performance Considerations

- **Block limit:** Cap at 500 blocks per terminal instance. Oldest blocks are virtualized (DOM removed, data retained in memory). Only blocks visible in the viewport + a buffer of 20 above/below are rendered.
- **Output truncation:** Block output strings are truncated to 100KB. Full output is available on demand from the terminal buffer.
- **Overlay positioning:** Use `IntersectionObserver` or terminal scroll events (debounced at 16ms) to reposition block overlays. Avoid layout thrashing by batching DOM reads and writes.
- **Attribution parsing:** The OSC parser runs synchronously on incoming terminal data. It must be O(n) in data length with no regex backtracking.

---

## Testing

- **Unit tests** for `TerminalBlockService`: mock `CommandDetection` events, verify block creation, type classification, attribution attachment.
- **Unit tests** for `parseAttributionOSC`: verify correct parsing of well-formed sequences, graceful handling of malformed data, stripping from visible output.
- **Snapshot tests** for `TerminalBlockRenderer`: render blocks with known state, assert DOM structure.
- **Integration tests**: verify blocks appear in the terminal panel when commands are executed in a Docker Compose test environment.

---

## Open Questions

1. **xterm.js integration depth:** Should block rendering use xterm.js's `IDecoration` API (simpler but less flexible) or a fully custom overlay layer (more control but more maintenance)?
2. **Multi-line commands:** How should blocks handle commands that span multiple lines (heredocs, multi-line strings)? Rely on `CommandDetection` or add custom parsing?
3. **Streaming output:** Should blocks update their output in real-time as the command runs, or only on completion? Real-time is better UX but requires careful DOM update batching.
4. **Checkpoint storage:** Should checkpoints be lightweight git tags, stash entries, or full commits on a hidden branch?
