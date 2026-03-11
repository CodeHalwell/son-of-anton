# Mission Control -- Design Specification

**Status:** Draft
**Author:** Son of Anton Team
**Date:** 2026-03-10
**Modification Tier:** Tier 1 (new files alongside core) + Tier 2 (keybinding registration, view container hook)

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Layout](#2-layout)
3. [Task Card Design](#3-task-card-design)
4. [Interaction Model](#4-interaction-model)
5. [Data Contracts](#5-data-contracts)
6. [Integration Points](#6-integration-points)
7. [File Locations](#7-file-locations)
8. [Implementation Notes](#8-implementation-notes)

---

## 1. Purpose

Mission Control is the defining surface of Son of Anton. It exists because writing code is no longer the bottleneck -- orchestrating parallel streams of AI work is.

### The Problem

Traditional IDEs treat the developer as a typist. The editor is the center of the universe, and every interaction funnels through a text cursor. When an AI agent is running a task, the developer has no spatial awareness of what is happening across the project. Multiple agents produce diffs, test results, and refactoring proposals, but the developer sees them one at a time through a chat log.

### The Solution

Mission Control is an asynchronous command center for parallel agents. Inspired by Google Antigravity's spatial orchestration model, it transforms the developer's role from typist to architectural director. Instead of writing code line by line, the developer:

- **Dispatches** high-level tasks to agents ("refactor the auth module to use OAuth2", "write integration tests for the payment service")
- **Monitors** multiple agents working in parallel across different parts of the codebase
- **Reviews** completed work spatially -- seeing all agent output organized by status, not buried in a chat thread
- **Approves or rejects** agent proposals with full context: diffs, terminal output, token cost, and checkpoint history

Mission Control is deliberately not an editor. It does not show source code. It shows *work in progress* -- a live map of what the AI is doing, what it has finished, and what needs human attention. The editor remains available via a single keypress, but Mission Control is the home screen when orchestrating.

### The Agile Board Model

Mission Control is not just a monitoring dashboard — it is a **collaborative project board** where the user and the orchestrator (Anton) work together as co-managers.

Think of it as an embedded Jira/Linear board where:

- **The user** can create tickets manually, set priorities, assign agents, drag cards between columns, and define acceptance criteria
- **The orchestrator (Anton)** can also create tickets, decompose epics into stories, update card status, write acceptance notes, and propose task ordering
- **Specialist agents** have MCP tool access to move their own tickets (e.g., a code review agent moves its card from Running → Review when done)
- **The board itself** is the source of truth for what's happening — not the chat log

This makes the developer an **agile scrum master** directing AI team members, while Anton acts as a **tech lead** who can independently triage, plan sprints, and keep the board current.

### Who Can Do What

| Actor | Create tickets | Move tickets | Edit tickets | Set priority | Assign agents | Auto-update status |
|-------|---------------|-------------|-------------|-------------|--------------|-------------------|
| User (developer) | Yes | Yes (any transition) | Yes | Yes | Yes | No |
| Orchestrator (Anton) | Yes | Yes (valid transitions) | Yes (summary, description) | Yes (proposes, user confirms) | Yes | No |
| Specialist agents | No | Yes (own tickets only: Running→Review, Running→Failed) | Append trace only | No | No | Yes (token usage, progress) |

### Design Principles

| Principle | Implication |
|-----------|-------------|
| Spatial over sequential | Cards on a canvas, not messages in a log |
| Status at a glance | Color, position, and size encode information |
| Minimal interaction cost | One click to approve, one click to reject |
| Full context on demand | Expand any card to see the complete agent trace |
| Cost awareness | Token usage and dollar cost visible at all times |
| Collaborative by default | Both human and AI can manage the board |
| Agent autonomy with guardrails | Agents update their own tickets but can't bypass review |

---

## 2. Layout

Mission Control replaces the editor area entirely. When activated, the file tree, editor pane, and auxiliary panels are hidden. The full window width is given to the orchestration canvas.

### 2.1 Mode Toggle

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+M` (macOS) / `Ctrl+Shift+M` (Windows/Linux) | Toggle between Editor Mode and Mission Control |

The toggle is a hard switch. Only one mode is active at a time. Workbench state (open editors, sidebar position, panel visibility) is preserved and restored on toggle.

### 2.2 Visual Layout

```
+------------------------------------------------------------------------+
|                            Titlebar (preserved)                         |
+------------------------------------------------------------------------+
|  [Queued]          [Running]          [Review]          [Complete]      |
|                                                                        |
|  +------------+   +------------+    +------------+    +------------+   |
|  | Task Card  |   | Task Card  |    | Task Card  |    | Task Card  |   |
|  |            |   |  (active)  |    | (pending)  |    |  (done)    |   |
|  +------------+   +------------+    +------------+    +------------+   |
|                   +------------+    +------------+    +------------+   |
|                   | Task Card  |    | Task Card  |    | Task Card  |   |
|                   |  (active)  |    |            |    |            |   |
|                   +------------+    +------------+    +------------+   |
|                                                                        |
+---------------------------------------------+--------------------------+
| Agent Activity Feed                         |   DAG Minimap            |
| > [Sonnet] Wrote 3 test files for auth...   |   [interactive graph]    |
| > [Opus] Planning refactor of payment...    |                          |
| > [Haiku] Indexed 47 files in /src/...      |   [ Open DAG Explorer ]  |
+---------------------------------------------+--------------------------+
```

### 2.3 Dimensions

| Element | Sizing |
|---------|--------|
| Kanban area | Fills remaining height after titlebar, minus bottom bar (200px) |
| Column width | `calc((100vw - 80px) / 4)` -- four equal columns with 16px gaps and 16px outer padding |
| Column gap | 16px |
| Outer padding | 16px on all sides |
| Bottom bar height | 200px (Agent Activity Feed + DAG Minimap) |
| Activity Feed width | `calc(100% - 320px)` |
| DAG Minimap width | 300px |
| DAG Minimap border-left | 1px solid `#2A2A2A` |

### 2.4 Colors

| Element | Color | CSS Custom Property |
|---------|-------|---------------------|
| Mission Control background | `#111111` | `--mc-background` |
| Column header background | `#161616` | `--mc-column-header-bg` |
| Column header text | `#F5A623` | `--mc-primary` |
| Column body background | transparent | -- |
| Bottom bar background | `#0D0D0D` | `--mc-bottom-bar-bg` |
| Activity feed text | `#A0A0A0` | `--mc-text-muted` |
| Primary accent (amber/gold) | `#F5A623` | `--mc-primary` |
| Secondary accent (muted gold) | `#B8860B` | `--mc-secondary` |
| Text primary | `#E0E0E0` | `--mc-text` |
| Text secondary | `#808080` | `--mc-text-secondary` |
| Border default | `#2A2A2A` | `--mc-border` |

### 2.5 Column Headers

Each column header is a fixed-height bar (40px) with:

- Column title in uppercase, 11px, `font-weight: 600`, letter-spacing `0.08em`, color `--mc-primary`
- Task count badge: pill shape, background `--mc-secondary`, color `#FFFFFF`, font-size 10px, min-width 20px, height 18px, border-radius 9px
- Bottom border: 2px solid, colored by column status:
  - Queued: `#808080`
  - Running: `#F5A623`
  - Review: `#E67E22`
  - Complete: `#27AE60`

---

## 3. Task Card Design

Each task card represents a single agent task dispatched by the orchestrator or the developer.

### 3.1 Card Dimensions and Styling

| Property | Value |
|----------|-------|
| Background | `#161616` |
| Border | 1px solid `#2A2A2A` |
| Border radius | 6px |
| Padding | 12px 14px |
| Min height | 120px |
| Max height (collapsed) | 180px |
| Width | 100% of column |
| Margin bottom | 8px |
| Left border | 3px solid, colored by status |
| Hover effect | border-color transitions to `#F5A623` over 150ms; box-shadow: `0 0 12px rgba(245, 166, 35, 0.15)` |
| Focus outline | 2px solid `#F5A623`, offset 2px |
| Transition | `border-color 150ms ease, box-shadow 150ms ease` |

### 3.2 Status Border Colors

| Status | Left Border Color | CSS Custom Property |
|--------|-------------------|---------------------|
| Queued | `#808080` | `--mc-status-queued` |
| Running | `#F5A623` | `--mc-status-running` |
| Review | `#E67E22` | `--mc-status-review` |
| Complete | `#27AE60` | `--mc-status-complete` |
| Failed | `#E74C3C` | `--mc-status-failed` |
| Paused | `#9B59B6` | `--mc-status-paused` |

### 3.3 Card Content (Collapsed State)

```
+--+-------------------------------------------------------+
|  | [Agent Icon] Agent Name                  [Model Badge] |
|  |                                                        |
|  | Task summary text that may wrap to two lines           |
|  | but is truncated with ellipsis after that...            |
|  |                                                        |
|  | 02:34 elapsed    1,247 tokens    $0.02    [chk-a7f3]   |
+--+-------------------------------------------------------+
 ^
 | 3px status border
```

| Element | Typography | Color |
|---------|------------|-------|
| Agent name | 13px, `font-weight: 600` | `--mc-text` |
| Model badge | 10px, uppercase, `font-weight: 500`, pill background | See below |
| Task summary | 12px, `font-weight: 400`, max 2 lines, `text-overflow: ellipsis` | `--mc-text-secondary` |
| Metadata row | 11px, `font-weight: 400` | `--mc-text-muted` |
| Checkpoint ID | 11px, `font-family: monospace` | `--mc-secondary` |

### 3.4 Model Badges

| Model | Badge Text | Background | Text Color |
|-------|-----------|------------|------------|
| Opus | `OPUS` | `#7B2D8B` | `#FFFFFF` |
| Sonnet | `SONNET` | `#2D5B8B` | `#FFFFFF` |
| Haiku | `HAIKU` | `#2D8B5B` | `#FFFFFF` |

Badge dimensions: height 16px, padding 0 6px, border-radius 3px, font-size 9px, letter-spacing `0.05em`.

### 3.5 Agent Icons

Each agent type has a distinct icon rendered as a 24x24px inline SVG or Codicon. The icon container has a 28x28px bounding box with 2px border-radius and background `#1E1E1E`.

| Agent | Icon (Codicon) | Fallback |
|-------|---------------|----------|
| Code Review | `$(eye)` | `CR` |
| Refactor | `$(wrench)` | `RF` |
| Test Writer | `$(beaker)` | `TW` |
| Explorer | `$(search)` | `EX` |
| Planner | `$(project)` | `PL` |
| Custom | `$(extensions)` | First two letters |

### 3.6 Card Content (Expanded State)

When a card is expanded (clicked or Enter key), it grows to fill available column height (max 60vh) and reveals additional sections:

```
+--+-------------------------------------------------------+
|  | [Agent Icon] Agent Name                  [Model Badge] |
|  |                                                        |
|  | Full task summary without truncation. This can be      |
|  | multiple lines and will scroll if needed.              |
|  |                                                        |
|  | 02:34 elapsed    1,247 tokens    $0.02    [chk-a7f3]   |
|  +-------------------------------------------------------+
|  | Agent Trace                                     [^]    |
|  | ------------------------------------------------       |
|  | 14:02:31  Planning: identified 3 files to modify       |
|  | 14:02:33  Reading: src/auth/handler.ts                  |
|  | 14:02:34  Reading: src/auth/middleware.ts                |
|  | 14:02:36  Writing: src/auth/handler.ts (47 lines)       |
|  | 14:02:38  Running: npm test -- auth                     |
|  | 14:02:41  Tests passed (12/12)                          |
|  +-------------------------------------------------------+
|  | Diff Preview                                           |
|  | ------------------------------------------------       |
|  | src/auth/handler.ts  +23 -11                           |
|  | src/auth/middleware.ts  +8 -3                           |
|  +-------------------------------------------------------+
|  | [Approve]  [Reject]  [Pause]  [Checkpoint]  [Diff]    |
+--+-------------------------------------------------------+
```

### 3.7 Action Buttons

Action buttons appear in the card footer when expanded, and as icon-only buttons on hover when collapsed.

| Action | Icon | Shortcut (when card focused) | Behavior |
|--------|------|-----|----------|
| Approve | `$(check)` | `A` | Accepts the agent's output. Moves card to Complete. Feeds approval back to agent manager. |
| Reject | `$(close)` | `R` | Rejects the agent's output. Moves card to Queued for retry or removes it. Opens rejection reason dialog. |
| Pause | `$(debug-pause)` | `P` | Pauses a running agent. Card stays in Running with Paused status border. |
| Checkpoint | `$(save)` | `C` | Creates a checkpoint of the current agent state. Updates checkpoint ID on card. |
| View Diff | `$(diff)` | `D` | Opens the diff view in a modal editor overlay (using the existing `ModalEditorPart` infrastructure). |

Button dimensions: height 28px, padding 0 12px, border-radius 4px, font-size 12px.

| Button | Background | Hover Background | Text Color |
|--------|-----------|-----------------|------------|
| Approve | `#1A3D1A` | `#27AE60` | `#FFFFFF` |
| Reject | `#3D1A1A` | `#E74C3C` | `#FFFFFF` |
| Pause | `#2A2A2A` | `#3A3A3A` | `--mc-text` |
| Checkpoint | `#2A2A2A` | `#3A3A3A` | `--mc-text` |
| View Diff | `#1A2A3D` | `#2D5B8B` | `#FFFFFF` |

---

## 4. Interaction Model

### 4.1 Drag and Drop

Cards can be dragged between columns to manually override agent flow. This is an escape hatch for when the developer wants to force a state transition (e.g., moving a stuck "Running" card back to "Queued" for reassignment).

| Drag behavior | Detail |
|---------------|--------|
| Drag handle | Entire card is draggable (cursor changes to `grab` on hover) |
| Drag ghost | Semi-transparent clone of the card at 60% opacity |
| Drop target | Column highlights with `--mc-primary` border (2px dashed) when a card is dragged over it |
| Invalid drop | Card animates back to original position (300ms ease-out) |
| Valid transitions | Queued <-> Running, Running -> Review, Review -> Complete, Review -> Queued, any -> Queued |
| Invalid transitions | Complete -> Running (must re-queue), Complete -> Review |
| Drop animation | Card fades in at drop position (150ms) |

Implementation: Use VS Code's existing `IDragAndDropData` and `IListDragAndDropProvider` patterns from `vs/base/browser/ui/list/listView.ts`. Do not use HTML5 drag-and-drop directly.

### 4.2 Click Interactions

| Target | Action |
|--------|--------|
| Card (collapsed) | Expand card in-place, showing full trace, diff preview, and action buttons |
| Card (expanded) | Collapse card back to summary view |
| Card action button | Execute the action (approve, reject, pause, checkpoint, view diff) |
| Column header | No action (static label) |
| DAG Minimap | Click a node to highlight the corresponding task card; double-click to open DAG Explorer |
| Activity Feed entry | Click to scroll to and highlight the corresponding task card |
| "Open DAG Explorer" button | Opens the full DAG Explorer in a modal editor overlay |

### 4.3 Right-Click Context Menu

Right-clicking a task card opens a context menu registered via `MenuId.MissionControlTaskContext`:

| Menu Item | Icon | Condition | Action |
|-----------|------|-----------|--------|
| Pause Agent | `$(debug-pause)` | Status is `Running` | Pauses the agent |
| Resume Agent | `$(debug-start)` | Status is `Paused` | Resumes the agent |
| Cancel Task | `$(trash)` | Status is `Running` or `Queued` | Cancels the task and removes the card |
| Reassign Model... | `$(symbol-enum)` | Status is `Queued` or `Paused` | Opens quick pick to select Opus/Sonnet/Haiku |
| Create Checkpoint | `$(save)` | Status is `Running` | Creates a checkpoint |
| View Checkpoint... | `$(history)` | Has checkpoints | Opens checkpoint picker |
| View Full Diff | `$(diff)` | Has changes | Opens diff in modal editor |
| Copy Task ID | `$(clippy)` | Always | Copies task ID to clipboard |

### 4.4 Keyboard Navigation

Mission Control is fully keyboard-navigable. When Mission Control is focused:

| Key | Action |
|-----|--------|
| `ArrowLeft` / `ArrowRight` | Move focus between columns |
| `ArrowUp` / `ArrowDown` | Move focus between cards within a column |
| `Enter` | Expand/collapse the focused card |
| `Escape` | If a card is expanded, collapse it. If no card is expanded, toggle back to Editor Mode. |
| `A` | Approve focused card (when in Review column) |
| `R` | Reject focused card (when in Review column) |
| `P` | Pause/resume focused card (when in Running column) |
| `C` | Create checkpoint for focused card |
| `D` | View diff for focused card |
| `Tab` | Move focus from kanban area to activity feed to DAG minimap |
| `Shift+Tab` | Reverse focus order |
| `Cmd+Shift+M` / `Ctrl+Shift+M` | Toggle back to Editor Mode |

Focus is indicated by the standard 2px `#F5A623` outline with 2px offset. The focused column header receives a subtle background change to `#1A1A1A`.

### 4.5 Running Card Animation

Cards in the Running column with `running` status display a subtle pulse animation on the left status border:

```css
@keyframes mc-pulse {
    0%, 100% { border-left-color: var(--mc-status-running); }
    50% { border-left-color: var(--mc-secondary); }
}

.mc-task-card[data-status="running"] {
    animation: mc-pulse 2s ease-in-out infinite;
}
```

This animation respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
    .mc-task-card[data-status="running"] {
        animation: none;
    }
}
```

---

## 5. Data Contracts

### 5.1 Core Types

```typescript
/**
 * Identifies the model tier used for an agent task.
 */
export const enum MissionControlModelId {
    Opus = 'opus',
    Sonnet = 'sonnet',
    Haiku = 'haiku',
}

/**
 * Task lifecycle status.
 */
export const enum MissionControlTaskStatus {
    Queued = 'queued',
    Running = 'running',
    Paused = 'paused',
    Review = 'review',
    Complete = 'complete',
    Failed = 'failed',
}

/**
 * A single entry in the agent's execution trace.
 */
export interface IMissionControlTraceEntry {
    readonly timestamp: number;
    readonly action: string;
    readonly detail: string;
    readonly filePath?: string;
    readonly linesChanged?: { added: number; removed: number };
}

/**
 * Token usage and cost breakdown for a task.
 */
export interface IMissionControlTokenUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number;
}

/**
 * A file changed by an agent task.
 */
export interface IMissionControlFileDiff {
    readonly filePath: string;
    readonly linesAdded: number;
    readonly linesRemoved: number;
    readonly hunks: number;
}

/**
 * Represents a single agent task displayed as a card in Mission Control.
 */
export interface IMissionControlTask {
    readonly id: string;
    readonly agentName: string;
    readonly agentIcon: string;
    readonly modelId: MissionControlModelId;
    readonly status: MissionControlTaskStatus;
    readonly summary: string;
    readonly fullDescription: string;
    readonly tokenUsage: IMissionControlTokenUsage;
    readonly checkpointId: string | undefined;
    readonly checkpointHistory: readonly string[];
    readonly startTime: number;
    readonly endTime: number | undefined;
    readonly elapsedMs: number;
    readonly trace: readonly IMissionControlTraceEntry[];
    readonly fileDiffs: readonly IMissionControlFileDiff[];
    readonly terminalOutput: string | undefined;
    readonly errorMessage: string | undefined;
    readonly parentTaskId: string | undefined;
    readonly dagNodeId: string | undefined;
}
```

### 5.2 Service Interface

```typescript
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMissionControlService = createDecorator<IMissionControlService>('missionControlService');

/**
 * Event data emitted when a task changes.
 */
export interface IMissionControlTaskChangeEvent {
    readonly task: IMissionControlTask;
    readonly previousStatus?: MissionControlTaskStatus;
}

/**
 * Central service for managing Mission Control task state.
 *
 * Task state is held in memory for the duration of the session.
 * No persistence to disk -- tasks are transient to the active session.
 */
export interface IMissionControlService extends IDisposable {

    readonly _serviceBrand: undefined;

    // --- Events ---

    /** Fires when a new task is created. */
    readonly onTaskCreated: Event<IMissionControlTask>;

    /** Fires when any property of a task changes (status, trace, token usage, etc.). */
    readonly onTaskUpdated: Event<IMissionControlTaskChangeEvent>;

    /** Fires when a task reaches Complete status. */
    readonly onTaskCompleted: Event<IMissionControlTask>;

    /** Fires when a task reaches Failed status. */
    readonly onTaskFailed: Event<IMissionControlTask>;

    /** Fires when a task is removed from the board. */
    readonly onTaskRemoved: Event<string /* taskId */>;

    // --- Queries ---

    /** Returns all tasks, optionally filtered by status. */
    getTasks(status?: MissionControlTaskStatus): readonly IMissionControlTask[];

    /** Returns a single task by ID, or undefined if not found. */
    getTask(taskId: string): IMissionControlTask | undefined;

    /** Returns the count of tasks in each status. */
    getStatusCounts(): Record<MissionControlTaskStatus, number>;

    /** Returns total estimated cost across all active tasks. */
    getTotalCost(): number;

    // --- Mutations ---

    /** Creates a new task and places it in the Queued column. Returns the task ID. */
    createTask(params: {
        agentName: string;
        agentIcon: string;
        modelId: MissionControlModelId;
        summary: string;
        fullDescription: string;
        parentTaskId?: string;
        dagNodeId?: string;
    }): string;

    /** Updates the status of a task. Validates the transition is legal. */
    updateTaskStatus(taskId: string, newStatus: MissionControlTaskStatus): void;

    /** Appends a trace entry to a task. */
    appendTrace(taskId: string, entry: Omit<IMissionControlTraceEntry, 'timestamp'>): void;

    /** Updates token usage for a task. */
    updateTokenUsage(taskId: string, usage: IMissionControlTokenUsage): void;

    /** Creates a checkpoint for a task. Returns the checkpoint ID. */
    createCheckpoint(taskId: string): string;

    /** Updates the model assigned to a task (only valid for Queued or Paused tasks). */
    reassignModel(taskId: string, modelId: MissionControlModelId): void;

    /** Removes a task from the board. */
    removeTask(taskId: string): void;

    /** Approves a task in Review status. Moves it to Complete. */
    approveTask(taskId: string): void;

    /** Rejects a task in Review status. Moves it back to Queued with the given reason. */
    rejectTask(taskId: string, reason: string): void;
}
```

### 5.3 Valid Status Transitions

```
           +--------+
    +----->| Queued  |<-----+
    |      +----+---+      |
    |           |           |
    |           v           |
    |      +--------+      |
    |  +-->| Running|---+  |
    |  |   +----+---+   |  |
    |  |        |        |  |
    |  |        v        |  |
    |  |   +--------+   |  |
    |  +---| Paused |   |  |
    |      +--------+   |  |
    |                    |  |
    |        +-----------+  |
    |        |              |
    |        v              |
    |   +--------+          |
    +---| Review |          |
        +----+---+          |
             |              |
             v              |
        +----------+        |
        | Complete |        |
        +----------+        |
                             |
        +--------+           |
        | Failed |----------+
        +--------+   (retry)
```

Transition rules enforced by `IMissionControlService.updateTaskStatus()`:

| From | Allowed To |
|------|------------|
| Queued | Running |
| Running | Paused, Review, Failed |
| Paused | Running, Queued |
| Review | Complete, Queued |
| Complete | (terminal) |
| Failed | Queued (retry) |

---

## 6. Integration Points

### 6.1 Orchestrator Agent

The orchestrator agent is the primary producer of Mission Control tasks. When the orchestrator decomposes a high-level user request into sub-tasks:

1. Orchestrator calls `IMissionControlService.createTask()` for each sub-task
2. Cards appear in the Queued column
3. As agents are dispatched, the orchestrator calls `updateTaskStatus(id, Running)`
4. The orchestrator streams trace entries via `appendTrace()` as the agent works
5. On agent completion, the orchestrator moves the task to Review

```typescript
// Example: Orchestrator creating a task
const taskId = missionControlService.createTask({
    agentName: 'Code Review Agent',
    agentIcon: '$(eye)',
    modelId: MissionControlModelId.Sonnet,
    summary: 'Review auth module refactoring for security issues',
    fullDescription: 'Analyze the changes made to src/auth/ by the refactoring agent...',
    parentTaskId: parentId,
    dagNodeId: 'node-review-auth',
});
```

### 6.2 Agent Completion and Review

When an agent finishes its work:

1. Agent manager calls `updateTaskStatus(id, Review)`
2. Agent manager updates `fileDiffs` with the changed files
3. The card moves to the Review column with an amber glow animation (300ms)
4. The developer sees the card and can Approve or Reject

On **Approve**:
- `IMissionControlService.approveTask(taskId)` is called
- Card moves to Complete column
- Orchestrator is notified and may trigger dependent tasks
- If the task has a `dagNodeId`, the DAG Explorer updates the node to "complete"

On **Reject**:
- `IMissionControlService.rejectTask(taskId, reason)` is called
- Card moves back to Queued column
- The rejection reason is appended to the task description for the next agent attempt
- Orchestrator is notified and may re-dispatch with adjusted parameters

### 6.3 Cost Ticker

The titlebar displays a running cost total aggregated from all active tasks:

```
Son of Anton | Session: auth-refactor | $0.47 | 3 agents running
```

Implementation:
- Register a titlebar contribution that subscribes to `IMissionControlService.onTaskUpdated`
- Sum `tokenUsage.estimatedCostUsd` across all non-removed tasks
- Update display on each event
- Format as USD with 2 decimal places (or 4 for sub-cent amounts)
- Color: `--mc-primary` when under budget, `#E74C3C` when approaching session spend cap

### 6.4 DAG Explorer

The DAG minimap in the bottom-right corner shows a simplified view of the task dependency graph:

- Nodes represent tasks, colored by status (same colors as card status borders)
- Edges represent dependencies (`parentTaskId` relationships)
- Currently running tasks pulse with the same animation as running cards
- Clicking a node scrolls to and highlights the corresponding task card in the kanban

The minimap uses a force-directed layout rendered to a `<canvas>` element (300x180px). The full DAG Explorer (opened via the button or double-click) renders in a `ModalEditorPart` overlay with pan/zoom controls.

### 6.5 Agent Activity Feed

The activity feed in the bottom-left is a scrolling log of agent actions with attribution:

```
14:02:41  [Sonnet] Code Review Agent   Completed review of src/auth/handler.ts
14:02:38  [Opus]   Planner Agent       Re-planning: dependency conflict detected
14:02:36  [Haiku]  Explorer Agent      Indexed 47 files in src/services/
```

| Column | Width | Content |
|--------|-------|---------|
| Timestamp | 64px | `HH:mm:ss` format, color `--mc-text-muted` |
| Model badge | 60px | Pill badge matching card model badges |
| Agent name | 180px | Truncated with ellipsis, color `--mc-text` |
| Action | remaining | Description, color `--mc-text-secondary` |

Feed implementation:
- Virtual list for performance (reuse `vs/base/browser/ui/list/listView.ts`)
- Maximum 1000 entries in memory, oldest evicted
- Auto-scrolls to bottom unless user has scrolled up
- Subscribe to `IMissionControlService.onTaskUpdated` to generate entries from trace data

---

## 7. File Locations

All Mission Control files live under `src/vs/sessions/contrib/missionControl/`. This is a Tier 1 location -- new files alongside existing session contributions.

```
src/vs/sessions/contrib/missionControl/
├── browser/
│   ├── missionControl.contribution.ts    — View container registration, keybinding,
│   │                                       and contribution imports
│   ├── missionControlView.ts             — Main view pane (extends ViewPane),
│   │                                       owns the kanban + bottom bar layout
│   ├── missionControlService.ts          — IMissionControlService implementation,
│   │                                       in-memory task state, event emitters
│   ├── taskCard.ts                       — Task card DOM component, renders collapsed
│   │                                       and expanded states, handles card actions
│   ├── taskKanban.ts                     — Kanban layout manager, owns the four
│   │                                       columns, handles drag-and-drop between them
│   ├── activityFeed.ts                   — Agent activity feed virtual list,
│   │                                       subscribes to task events
│   ├── dagMinimap.ts                     — DAG minimap canvas renderer,
│   │                                       force-directed layout
│   ├── missionControlActions.ts          — Command registrations: toggle Mission
│   │                                       Control, approve, reject, pause, etc.
│   └── media/
│       ├── missionControl.css            — All Mission Control styles, CSS custom
│       │                                   properties, animations
│       └── icons/                        — Agent type SVG icons (if needed beyond
│                                           Codicons)
└── common/
    ├── missionControlTypes.ts            — IMissionControlTask, enums, and all
    │                                       type definitions from Section 5.1
    └── missionControlService.ts          — IMissionControlService interface
                                            definition and service decorator
```

### 7.1 Registration

The contribution is registered by importing `missionControl.contribution.ts` in `src/vs/sessions/sessions.desktop.main.ts` (Tier 2 -- adding an import to an existing file):

```typescript
// In sessions.desktop.main.ts, add to the contribution imports:
import 'vs/sessions/contrib/missionControl/browser/missionControl.contribution';
```

---

## 8. Implementation Notes

### 8.1 View Registration

Mission Control registers as a view within the sessions workbench using the standard contribution model:

```typescript
// missionControl.contribution.ts

import { ViewContainerLocation } from 'vs/workbench/common/views';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ViewExtensions, IViewsRegistry, IViewContainersRegistry } from 'vs/workbench/common/views';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { MissionControlViewPane } from 'vs/sessions/contrib/missionControl/browser/missionControlView';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

const MISSION_CONTROL_VIEW_CONTAINER_ID = 'workbench.view.missionControl';
const MISSION_CONTROL_VIEW_ID = 'workbench.view.missionControl.canvas';

// Register view container
const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const missionControlContainer = viewContainersRegistry.registerViewContainer(
    {
        id: MISSION_CONTROL_VIEW_CONTAINER_ID,
        title: nls.localize2('missionControl', "Mission Control"),
        ctorDescriptor: new SyncDescriptor(ViewPaneContainer),
        hideIfEmpty: false,
    },
    ViewContainerLocation.Panel, // Registered as panel but rendered full-width
    { isDefault: false }
);

// Register view
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([{
    id: MISSION_CONTROL_VIEW_ID,
    name: nls.localize('missionControlCanvas', "Mission Control Canvas"),
    containerIcon: Codicon.dashboard,
    ctorDescriptor: new SyncDescriptor(MissionControlViewPane),
    canToggleVisibility: false,
    canMoveView: false,
}], missionControlContainer);
```

### 8.2 Mode Toggle Implementation

The toggle between Editor Mode and Mission Control is implemented as a workbench action that manipulates part visibility:

```typescript
registerAction2(class ToggleMissionControlAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleMissionControl',
            title: nls.localize2('toggleMissionControl', "Toggle Mission Control"),
            keybinding: {
                primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM,
                weight: KeybindingWeight.WorkbenchContrib,
            },
            category: nls.localize2('missionControl', "Mission Control"),
        });
    }

    async run(accessor: ServicesAccessor): Promise<void> {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const missionControlService = accessor.get(IMissionControlService);

        if (missionControlService.isActive) {
            // Switch to Editor Mode: restore previous part visibility
            missionControlService.deactivate();
            // Restore sidebar, editor, auxiliary bar visibility from saved state
        } else {
            // Switch to Mission Control: hide editor chrome, show full-width canvas
            missionControlService.activate();
            // Hide sidebar, editor, auxiliary bar; show Mission Control panel full-width
        }
    }
});
```

### 8.3 DOM Structure

Mission Control uses direct DOM manipulation following VS Code patterns. No framework (React, Lit, etc.).

```typescript
// Simplified DOM structure created by MissionControlViewPane.renderBody()

class MissionControlViewPane extends ViewPane {
    protected override renderBody(container: HTMLElement): void {
        const root = dom.append(container, dom.$('.mission-control'));
        root.style.backgroundColor = 'var(--mc-background)';

        // Kanban area
        const kanban = dom.append(root, dom.$('.mc-kanban'));
        this.kanbanManager = this._register(
            this.instantiationService.createInstance(TaskKanban, kanban)
        );

        // Bottom bar
        const bottomBar = dom.append(root, dom.$('.mc-bottom-bar'));

        // Activity feed (left)
        const feedContainer = dom.append(bottomBar, dom.$('.mc-activity-feed'));
        this.activityFeed = this._register(
            this.instantiationService.createInstance(ActivityFeed, feedContainer)
        );

        // DAG minimap (right)
        const minimapContainer = dom.append(bottomBar, dom.$('.mc-dag-minimap'));
        this.dagMinimap = this._register(
            this.instantiationService.createInstance(DagMinimap, minimapContainer)
        );
    }
}
```

### 8.4 CSS Custom Properties

All colors are defined as CSS custom properties on the `.mission-control` root element, making them themeable:

```css
.mission-control {
    /* Backgrounds */
    --mc-background: #111111;
    --mc-column-header-bg: #161616;
    --mc-card-bg: #161616;
    --mc-bottom-bar-bg: #0D0D0D;

    /* Accents */
    --mc-primary: #F5A623;
    --mc-secondary: #B8860B;

    /* Text */
    --mc-text: #E0E0E0;
    --mc-text-secondary: #808080;
    --mc-text-muted: #A0A0A0;

    /* Borders */
    --mc-border: #2A2A2A;

    /* Status colors */
    --mc-status-queued: #808080;
    --mc-status-running: #F5A623;
    --mc-status-paused: #9B59B6;
    --mc-status-review: #E67E22;
    --mc-status-complete: #27AE60;
    --mc-status-failed: #E74C3C;

    /* Model badge colors */
    --mc-model-opus: #7B2D8B;
    --mc-model-sonnet: #2D5B8B;
    --mc-model-haiku: #2D8B5B;
}
```

These properties can be overridden by VS Code themes via the standard `workbench.colorCustomizations` mechanism by registering them as color contributions.

### 8.5 Accessibility

Mission Control must meet WCAG 2.1 AA. The following ARIA roles and attributes are required:

| Element | Role | Attributes |
|---------|------|------------|
| Kanban container | `region` | `aria-label="Mission Control task board"` |
| Column | `list` | `aria-label="[Status] tasks"`, e.g., "Running tasks" |
| Column header | `heading` | `aria-level="2"` |
| Task card | `listitem` | `aria-label="[Agent]: [Summary], [Status]"`, `aria-expanded="true/false"` |
| Action button | `button` | `aria-label="[Action] task: [Summary]"` |
| Activity feed | `log` | `aria-label="Agent activity feed"`, `aria-live="polite"` |
| DAG minimap | `img` | `aria-label="Task dependency graph, [N] nodes"` |

Keyboard focus management:
- Focus trap within Mission Control when active (Tab cycles through kanban, activity feed, minimap)
- `aria-activedescendant` on the kanban container tracks the focused card
- Screen reader announcements for status changes via `aria-live` region

### 8.6 Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Many task cards | Virtual list per column; only DOM nodes for visible cards. Max 50 cards per column before scrolling. |
| Frequent trace updates | Batch trace appends -- buffer for 100ms before re-rendering the expanded card trace. |
| Token usage updates | Throttle to once per second per card. |
| DAG minimap rendering | Canvas-based rendering. Redraw only on topology changes, not on status updates. Status color changes use direct pixel manipulation. |
| Activity feed growth | Circular buffer of 1000 entries. Virtual list renders only visible rows. |
| Mode toggle | Part visibility changes are synchronous DOM operations. No layout thrash -- batch all hide/show into a single `requestAnimationFrame`. |

### 8.7 State Management

Task state is held in memory by `MissionControlService` for the duration of the session. There is no disk persistence.

```typescript
class MissionControlService implements IMissionControlService {
    private readonly _tasks = new Map<string, MissionControlTask>();
    private readonly _onTaskCreated = new Emitter<IMissionControlTask>();
    private readonly _onTaskUpdated = new Emitter<IMissionControlTaskChangeEvent>();
    private readonly _onTaskCompleted = new Emitter<IMissionControlTask>();
    private readonly _onTaskFailed = new Emitter<IMissionControlTask>();
    private readonly _onTaskRemoved = new Emitter<string>();

    // Internal mutable task class
    private class MissionControlTask {
        // ... mutable fields that produce readonly snapshots via toImmutable()
    }
}
```

The service is registered as a singleton scoped to the sessions workbench:

```typescript
registerSingleton(
    IMissionControlService,
    MissionControlService,
    InstantiationType.Delayed
);
```

### 8.8 Testing Strategy

| Test Type | Location | Coverage |
|-----------|----------|----------|
| Unit: `MissionControlService` | `src/vs/sessions/test/contrib/missionControl/missionControlService.test.ts` | State transitions, event firing, invalid transition rejection, cost aggregation |
| Unit: `TaskCard` | `src/vs/sessions/test/contrib/missionControl/taskCard.test.ts` | DOM rendering, expand/collapse, action button callbacks |
| Unit: `TaskKanban` | `src/vs/sessions/test/contrib/missionControl/taskKanban.test.ts` | Column assignment, drag-and-drop validation, card ordering |
| Integration | `src/vs/sessions/test/contrib/missionControl/missionControl.integrationTest.ts` | End-to-end: create task, update status, verify card appears in correct column |

---

## 9. Board Management — The Agile Workflow

### 9.1 Board Setup Flow

When a user starts a new task or project in Son of Anton, the board is set up collaboratively:

```
User: "I want to refactor the auth module to use OAuth2"
    │
    ▼
┌──────────────────────────────────────────────┐
│ Orchestrator (Anton) proposes a board setup: │
│                                              │
│  Epic: Auth Module OAuth2 Migration          │
│  ├── Story: Audit current auth endpoints     │
│  ├── Story: Design OAuth2 flow               │
│  ├── Story: Implement token service          │
│  ├── Story: Update middleware                 │
│  ├── Story: Write integration tests          │
│  └── Story: Security review                  │
│                                              │
│  [Accept]  [Modify]  [Let me set it up]      │
└──────────────────────────────────────────────┘
```

- **Accept**: Anton creates all tickets and starts executing
- **Modify**: User edits the proposed breakdown in-place, then confirms
- **Let me set it up**: User creates tickets manually; Anton only executes what's assigned

### 9.2 Ticket Hierarchy

```typescript
export const enum TicketType {
    Epic = 'epic',       // High-level feature (user creates)
    Story = 'story',     // Discrete unit of work (user or Anton creates)
    Subtask = 'subtask', // Agent-level task (Anton creates during execution)
}

export const enum TicketPriority {
    Critical = 'critical',  // Must do first, blocks everything
    High = 'high',          // Important, do soon
    Medium = 'medium',      // Normal priority
    Low = 'low',            // Nice to have, do if time
}
```

Epics contain Stories, Stories contain Subtasks. The kanban board shows Stories by default. Subtasks are visible when a Story card is expanded.

### 9.3 Extended Task Card Fields

```typescript
export interface IMissionControlTask {
    // ... existing fields ...

    // Agile fields
    readonly type: TicketType;
    readonly priority: TicketPriority;
    readonly createdBy: 'user' | 'orchestrator' | string; // agent name
    readonly assignedAgent: string | undefined;
    readonly acceptanceCriteria: readonly string[];
    readonly labels: readonly string[];
    readonly epicId: string | undefined;
    readonly storyPoints: number | undefined; // estimated complexity (1-8)
    readonly blockedBy: readonly string[]; // task IDs this is blocked by
    readonly blocks: readonly string[]; // task IDs this blocks

    // Collaborative fields
    readonly comments: readonly ITaskComment[];
    readonly rejectionHistory: readonly IRejection[];
}

export interface ITaskComment {
    readonly author: 'user' | string; // 'user' or agent name
    readonly timestamp: number;
    readonly text: string;
}

export interface IRejection {
    readonly timestamp: number;
    readonly reason: string;
    readonly attemptNumber: number;
}
```

### 9.4 Agent MCP Tools for Board Management

Specialist agents interact with the board via MCP tools exposed by the Mission Control service:

```typescript
// MCP tools registered by Mission Control for agent use

/** Agents call this to update their own ticket status */
tool('mission_control_update_status', {
    taskId: string,     // must be the agent's own task
    status: 'review' | 'failed',  // agents can only move to review or failed
    summary?: string,   // optional status update message
});

/** Agents call this to append progress to their ticket */
tool('mission_control_append_trace', {
    taskId: string,
    action: string,     // e.g., 'Reading file', 'Writing tests'
    detail: string,
    filePath?: string,
});

/** Agents call this to report file changes */
tool('mission_control_report_diff', {
    taskId: string,
    files: Array<{ path: string; added: number; removed: number }>,
});

/** Agents call this to add a comment to any visible ticket */
tool('mission_control_comment', {
    taskId: string,
    text: string,
});

/** Orchestrator-only: create a new ticket */
tool('mission_control_create_ticket', {
    type: 'epic' | 'story' | 'subtask',
    summary: string,
    description: string,
    priority: 'critical' | 'high' | 'medium' | 'low',
    assignedAgent?: string,
    parentId?: string,
    acceptanceCriteria?: string[],
    labels?: string[],
    storyPoints?: number,
});

/** Orchestrator-only: move any ticket between columns */
tool('mission_control_move_ticket', {
    taskId: string,
    status: MissionControlTaskStatus,
    reason?: string,
});

/** Orchestrator-only: assign an agent to a ticket */
tool('mission_control_assign', {
    taskId: string,
    agentName: string,
    modelId: 'opus' | 'sonnet' | 'haiku',
});
```

### 9.5 Board Views

The kanban is the default view. Future iterations add:

| View | Description | Trigger |
|------|-------------|---------|
| **Kanban** (default) | Cards in status columns | Default |
| **List** | Flat sorted list with filters | Toggle button |
| **Timeline** | Horizontal Gantt-style with dependencies | Toggle button |
| **Backlog** | Prioritised list of unstarted work | Filter: Queued only |

### 9.6 Sprint / Session Model

Each IDE session is a "sprint". When the user opens Son of Anton:

1. Any incomplete tickets from the previous session are restored (persisted to `.son-of-anton/board.json`)
2. Completed tickets are archived but visible via filter
3. The orchestrator can suggest: "You have 3 unfinished stories from last session. Resume or archive?"

```typescript
export interface IBoardState {
    readonly sessionId: string;
    readonly startedAt: number;
    readonly tickets: readonly IMissionControlTask[];
    readonly archivedTickets: readonly IMissionControlTask[];
    readonly totalCost: number;
}
```

Board state is persisted to `.son-of-anton/board.json` on every mutation (debounced 1s).

### 9.7 User Board Management Actions

In addition to the existing card actions, users can:

| Action | How | Effect |
|--------|-----|--------|
| Create ticket | `+` button in column header, or `Cmd+Shift+N` | Opens inline ticket creation form |
| Edit ticket | Double-click summary text, or `E` key | Inline edit of summary, description, priority |
| Set priority | Right-click → Priority submenu | Changes priority badge and sort order |
| Add acceptance criteria | Expand card → "Add criteria" button | Adds checkable criteria (agents check these) |
| Add label | Right-click → Labels submenu | Tags for filtering (e.g., `auth`, `frontend`, `testing`) |
| Filter board | Filter bar above columns | Filter by label, priority, agent, epic |
| Bulk actions | Shift+click multiple cards | Move, assign, or delete multiple tickets |
| Ask Anton to plan | "Plan this epic" button on epic cards | Orchestrator decomposes into stories |

### 9.8 Orchestrator Board Awareness

The orchestrator agent always has the board state in context. When planning or responding:

- It references ticket IDs in its reasoning ("I'll create subtasks for STORY-3")
- It proposes board changes before executing ("I recommend splitting this into 2 stories")
- It respects priorities (works on Critical before High before Medium)
- It respects dependencies (won't start a blocked ticket)
- It updates the board proactively ("STORY-2 is blocked by STORY-1, moving to Backlog")
- After completing a story, it checks acceptance criteria and self-reviews before moving to Review

---

## Appendix A: Open Questions

| # | Question | Impact | Decision Needed By |
|---|----------|--------|-------------------|
| 1 | Should completed tasks auto-archive after N minutes, or persist for the full session? | Memory usage for long sessions | Before implementation |
| 2 | Should the DAG minimap use Canvas 2D or WebGL for rendering? | Performance with large graphs | Before dagMinimap.ts |
| 3 | Should drag-and-drop between columns require a confirmation dialog for destructive transitions (e.g., Complete -> Queued)? | UX friction vs. safety | Before taskKanban.ts |
| 4 | Should Mission Control support multiple concurrent sessions, or is it always bound to the active session? | Service architecture | Before missionControlService.ts |
| 5 | What is the maximum number of concurrent agents the UI should gracefully handle? 10? 50? 100? | Virtual list thresholds, column sizing | Before taskKanban.ts |

## Appendix B: Future Considerations

These items are out of scope for the initial implementation but should inform architectural decisions:

- **Multi-window Mission Control** -- Detach Mission Control into its own Electron window for multi-monitor setups
- **Timeline view** -- Alternative to kanban: a horizontal timeline showing task execution over time
- **Cost budgets** -- Per-task and per-session cost limits with automatic agent pausing
- **Task templates** -- Save and replay common task configurations
- **Collaborative mode** -- Multiple developers viewing the same Mission Control via shared session state
