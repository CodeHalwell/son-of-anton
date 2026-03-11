# Hybrid Checkpoints — Design Spec

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-10
**Tier:** 1 (new files alongside core)

---

## Overview

Every agent action in Son of Anton creates a checkpoint — a restorable snapshot of workspace state captured before the agent modifies anything. Checkpoints provide fearless agent autonomy: users can let agents work freely because any change is trivially reversible.

The checkpoint system is hybrid: it uses Git for tracked source files (the common case) and file-system snapshots for everything else (configs, generated files, terminal state). Both mechanisms are unified behind a single `ICheckpointService` interface.

---

## Design Principles

1. **Every mutation gets a checkpoint** — No agent file modification happens without a checkpoint first. This is enforced at the API level, not by convention.
2. **Sub-second creation** — Checkpoints use Git plumbing commands and delta-based file copies, not full workspace snapshots. Creation must complete in under 500ms.
3. **Invisible until needed** — Checkpoints are created silently. Users see them only in Mission Control task cards, the title bar, and when they choose to rollback.
4. **Git-native** — For tracked files, checkpoints are real Git commits on shadow branches. They integrate naturally with Git tooling and can be inspected with standard Git commands.
5. **Session-scoped** — Checkpoints belong to agent sessions. When a session ends, its checkpoints can be pruned (configurable retention policy).

---

## Git Checkpoints

### Shadow Branches

Each agent session creates a shadow branch for its checkpoints:

```
.son-of-anton/checkpoints/<session-id>
```

Example: `.son-of-anton/checkpoints/sess-20260310-143022-abc123`

Shadow branches are local-only. They are never pushed to remote repositories. The `.son-of-anton/` prefix ensures they are visually separated from user branches in Git tooling.

### Checkpoint Creation Flow

```
Agent requests file modification
         │
         v
┌────────────────────────┐
│  Checkpoint Service     │
│                        │
│  1. Stage current file │    git hash-object -w <file>
│     contents           │    git update-index --add --cacheinfo ...
│                        │
│  2. Create tree object │    git write-tree
│                        │
│  3. Create commit      │    git commit-tree <tree> -p <parent> -m <message>
│                        │
│  4. Update shadow ref  │    git update-ref refs/checkpoints/<session>/<cp-id> <commit>
│                        │
│  5. Record in manifest │    append to checkpoint-manifest.json
│                        │
│  6. Return checkpoint  │    { id, gitRef, timestamp }
│     to agent           │
└────────────────────────┘
         │
         v
Agent proceeds with file modification
```

### Why Git Plumbing Commands

Standard `git commit` is too slow and too noisy for checkpointing:

| Operation | `git commit` | Git plumbing |
|---|---|---|
| Latency | 200-500ms | 20-50ms |
| Working tree impact | Modifies index | Uses temp index |
| User-visible | Shows in `git log` | Hidden in refs/checkpoints/ |
| Hook execution | Runs pre-commit hooks | No hooks |

Plumbing commands (`git hash-object`, `git write-tree`, `git commit-tree`, `git update-ref`) operate directly on Git objects without touching the working tree index or triggering hooks.

### Temporary Index

Checkpoint creation uses a separate index file (`GIT_INDEX_FILE` environment variable) to avoid interfering with the user's staged changes:

```typescript
const tempIndex = path.join(workspacePath, '.git', 'son-of-anton-checkpoint.index');
const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
// All git plumbing commands use this env
```

The temp index is cleaned up after each checkpoint creation.

### Commit Message Format

```
[checkpoint] <agent-name>: <action-summary>

Session: <session-id>
Checkpoint: <checkpoint-id>
Files: <file1>, <file2>, ...
Timestamp: <ISO-8601>
```

Example:

```
[checkpoint] refactor-agent: Extract helper function from processData

Session: sess-20260310-143022-abc123
Checkpoint: cp-1710081234-refactor-a1b2c3
Files: src/utils/data.ts, src/utils/helpers.ts
Timestamp: 2026-03-10T14:30:34.567Z
```

### Rollback

Rolling back to a Git checkpoint restores the specified files to their state at that commit:

```typescript
// Restore specific files from a checkpoint commit
await execGit(['checkout', checkpointRef, '--', ...filePaths], { cwd: workspacePath });
```

Full session rollback restores all files modified during the session:

```typescript
// Get all files modified in the session
const files = await getSessionModifiedFiles(sessionId);
// Restore from the first checkpoint of the session
await execGit(['checkout', firstCheckpointRef, '--', ...files], { cwd: workspacePath });
```

---

## File-System Checkpoints

### When Used

File-system checkpoints capture state that Git cannot track:

| State Type | Example | Why Not Git |
|---|---|---|
| Untracked generated files | `dist/`, `out/`, build artifacts | In `.gitignore` |
| Configuration state | `.env.local`, IDE settings | Sensitive or machine-specific |
| Terminal session state | Command history, working directory | Not a file |
| Non-text binary files | Images, compiled assets | Git handles poorly |
| External tool state | Docker container state, DB snapshots | Outside workspace |

### Storage Location

```
.son-of-anton/checkpoints/<session-id>/<checkpoint-id>/
    ├── files/                    # Changed files (delta copies)
    │   ├── dist/bundle.js.gz     # Compressed file content
    │   └── .env.local.gz
    ├── terminal-state.json       # Terminal session snapshot
    └── metadata.json             # Checkpoint metadata
```

### Delta-Based Storage

Only files that changed since the previous checkpoint are stored:

1. On checkpoint creation, hash all tracked non-git files
2. Compare hashes with the previous checkpoint
3. Copy only changed files into the checkpoint directory
4. Compress each file with gzip (typically 70-90% compression on text files)

### Terminal State Capture

```typescript
interface ITerminalState {
	readonly terminals: Array<{
		id: string;
		name: string;
		cwd: string;
		shellType: string;
		recentCommands: string[];      // Last 50 commands
		environmentOverrides: Record<string, string>;
	}>;
}
```

Terminal state is captured as a JSON snapshot. Full terminal buffer restoration is not supported (too large, too fragile). Instead, the checkpoint records enough to recreate equivalent terminal sessions.

### File-System Rollback

1. Read the checkpoint's file list from `metadata.json`
2. Decompress and restore each file to its original path
3. Restore terminal state by reopening terminals with saved working directories

---

## Hybrid Strategy

### Decision Matrix

When creating a checkpoint, the service determines which mechanism to use for each file:

| Condition | Mechanism |
|---|---|
| File is tracked by Git and not in `.gitignore` | Git checkpoint |
| File is untracked or in `.gitignore` | File-system checkpoint |
| File is binary and > 1MB | File-system checkpoint (even if tracked) |
| Terminal state | File-system checkpoint |
| Non-file state (configs, metadata) | File-system checkpoint |

A single checkpoint can use both mechanisms simultaneously. The checkpoint ID ties them together.

### Checkpoint ID Format

```
cp-<timestamp>-<agent>-<short-hash>
```

| Component | Format | Example |
|---|---|---|
| Prefix | `cp-` | `cp-` |
| Timestamp | Unix epoch in seconds | `1710081234` |
| Agent | Agent name, kebab-case, max 20 chars | `refactor` |
| Short hash | First 6 chars of SHA-256 of checkpoint content | `a1b2c3` |

Full example: `cp-1710081234-refactor-a1b2c3`

### Checkpoint Manifest

Each session maintains a `checkpoint-manifest.json` in the session's checkpoint directory:

```jsonc
{
  "sessionId": "sess-20260310-143022-abc123",
  "createdAt": "2026-03-10T14:30:22.000Z",
  "checkpoints": [
    {
      "id": "cp-1710081234-refactor-a1b2c3",
      "timestamp": "2026-03-10T14:30:34.567Z",
      "agentName": "refactor-agent",
      "agentId": "refactor",
      "action": "Extract helper function from processData",
      "gitRef": "refs/checkpoints/sess-20260310-143022-abc123/cp-1710081234-refactor-a1b2c3",
      "fsPath": ".son-of-anton/checkpoints/sess-20260310-143022-abc123/cp-1710081234-refactor-a1b2c3/",
      "files": [
        { "path": "src/utils/data.ts", "mechanism": "git" },
        { "path": "src/utils/helpers.ts", "mechanism": "git" },
        { "path": "dist/bundle.js", "mechanism": "fs" }
      ],
      "parentCheckpointId": null
    },
    {
      "id": "cp-1710081267-refactor-d4e5f6",
      "timestamp": "2026-03-10T14:31:07.123Z",
      "agentName": "refactor-agent",
      "agentId": "refactor",
      "action": "Update imports in 3 consumers",
      "gitRef": "refs/checkpoints/sess-20260310-143022-abc123/cp-1710081267-refactor-d4e5f6",
      "fsPath": null,
      "files": [
        { "path": "src/api/handler.ts", "mechanism": "git" },
        { "path": "src/cli/main.ts", "mechanism": "git" },
        { "path": "src/test/data.test.ts", "mechanism": "git" }
      ],
      "parentCheckpointId": "cp-1710081234-refactor-a1b2c3"
    }
  ]
}
```

---

## Integration with UI Surfaces

### Mission Control Task Cards

Each task card in Mission Control displays:

- **Checkpoint badge:** Shows the checkpoint ID (abbreviated to last 6 chars) on the card
- **Checkpoint count:** "3 checkpoints" indicator showing how many restore points exist for this task
- **Revert button:** Dropdown with all checkpoints for the task, most recent first
- **Diff preview:** Clicking a checkpoint shows a diff of what changed at that point

### Terminal Blocks

Terminal blocks (the enhanced terminal surface) show:

- **"Revert to this state" action** on each block that triggered a file modification
- **Checkpoint ID** next to the timestamp on destructive commands
- **Visual indicator** (amber dot) on blocks that have an associated checkpoint

### Title Bar

The title bar shows the latest checkpoint state:

```
Son of Anton — my-project — cp-a1b2c3 (2 min ago)
```

- Clicking the checkpoint ID opens a dropdown of recent checkpoints
- The dropdown shows: checkpoint ID, agent name, action summary, timestamp, file count
- Each item has "Revert" and "View diff" actions

### Context Menu

Right-clicking a file in Explorer when checkpoints exist shows:

- **"Revert to checkpoint..."** — Opens a quick pick with checkpoints that modified this file
- **"Compare with checkpoint..."** — Opens a diff editor against a selected checkpoint version

---

## Interfaces

### ICheckpoint

```typescript
interface ICheckpoint {
	readonly id: string;                        // cp-<timestamp>-<agent>-<short-hash>
	readonly sessionId: string;
	readonly timestamp: number;                 // Unix epoch milliseconds
	readonly agentName: string;
	readonly agentId: string;
	readonly action: string;                    // Human-readable action summary
	readonly gitRef?: string;                   // refs/checkpoints/... (if git mechanism used)
	readonly fsPath?: string;                   // .son-of-anton/checkpoints/... (if fs mechanism used)
	readonly files: ICheckpointFile[];
	readonly parentCheckpointId?: string;       // Previous checkpoint in this session
}

interface ICheckpointFile {
	readonly path: string;                      // Relative to workspace root
	readonly mechanism: 'git' | 'fs';
	readonly hash: string;                      // SHA-256 of file content at checkpoint time
	readonly sizeBytes: number;
}
```

### ICheckpointService

```typescript
interface ICheckpointService extends IDisposable {
	/**
	 * Create a checkpoint capturing the current state of the specified files.
	 * Must be called BEFORE the agent modifies the files.
	 */
	create(params: ICheckpointCreateParams): Promise<ICheckpoint>;

	/**
	 * Rollback workspace to the state captured by a specific checkpoint.
	 * Only restores files listed in the checkpoint, not the entire workspace.
	 */
	rollback(checkpointId: string): Promise<ICheckpointRollbackResult>;

	/**
	 * Rollback a specific file to its state at a specific checkpoint.
	 */
	rollbackFile(checkpointId: string, filePath: string): Promise<void>;

	/**
	 * List all checkpoints for a session, ordered by timestamp descending.
	 */
	list(sessionId: string): Promise<ICheckpoint[]>;

	/**
	 * List all checkpoints that modified a specific file.
	 */
	listForFile(filePath: string): Promise<ICheckpoint[]>;

	/**
	 * Get the diff between a checkpoint and the current state (or another checkpoint).
	 */
	diff(checkpointId: string, compareToId?: string): Promise<ICheckpointDiff>;

	/**
	 * Prune old checkpoints based on retention policy.
	 */
	prune(policy: ICheckpointRetentionPolicy): Promise<number>;

	/**
	 * Get current checkpoint for a session (most recent).
	 */
	getLatest(sessionId: string): Promise<ICheckpoint | undefined>;

	// Events
	onDidCreateCheckpoint: Event<ICheckpoint>;
	onDidRollback: Event<ICheckpointRollbackResult>;
}
```

### Supporting Types

```typescript
interface ICheckpointCreateParams {
	readonly sessionId: string;
	readonly agentName: string;
	readonly agentId: string;
	readonly action: string;
	readonly files: string[];                   // File paths to checkpoint
}

interface ICheckpointRollbackResult {
	readonly checkpointId: string;
	readonly filesRestored: string[];
	readonly filesSkipped: Array<{
		path: string;
		reason: 'not-found' | 'unchanged' | 'conflict';
	}>;
	readonly warnings: string[];
}

interface ICheckpointDiff {
	readonly checkpointId: string;
	readonly compareToId?: string;              // undefined means current state
	readonly files: Array<{
		path: string;
		status: 'added' | 'modified' | 'deleted';
		hunks: ICheckpointDiffHunk[];
	}>;
}

interface ICheckpointDiffHunk {
	readonly oldStart: number;
	readonly oldLines: number;
	readonly newStart: number;
	readonly newLines: number;
	readonly content: string;                   // Unified diff format
}

interface ICheckpointRetentionPolicy {
	readonly maxAge: number;                    // Max age in milliseconds
	readonly maxCount: number;                  // Max checkpoints per session
	readonly keepFirst: boolean;                // Always keep the first checkpoint of a session
	readonly keepLast: boolean;                 // Always keep the most recent checkpoint
}
```

---

## File Locations

| Path | Purpose |
|---|---|
| `extensions/son-of-anton/src/checkpoints/checkpointService.ts` | `ICheckpointService` implementation |
| `extensions/son-of-anton/src/checkpoints/gitCheckpoints.ts` | Git plumbing operations for checkpoint creation/rollback |
| `extensions/son-of-anton/src/checkpoints/fsCheckpoints.ts` | File-system checkpoint creation/rollback |
| `extensions/son-of-anton/src/checkpoints/checkpointManifest.ts` | Manifest file read/write operations |
| `extensions/son-of-anton/src/checkpoints/checkpointDiff.ts` | Diff computation between checkpoints |
| `extensions/son-of-anton/src/checkpoints/retentionPolicy.ts` | Pruning logic based on retention rules |
| `extensions/son-of-anton/src/checkpoints/types.ts` | All TypeScript interfaces |
| `services/checkpoint-service/` | Optional standalone checkpoint service (for remote workspaces) |
| `services/checkpoint-service/Dockerfile` | Container definition |
| `services/checkpoint-service/package.json` | Dependencies |
| `services/checkpoint-service/src/index.ts` | Service entry point |

---

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `sota.checkpoints.enabled` | boolean | `true` | Enable checkpoint creation |
| `sota.checkpoints.autoCreate` | boolean | `true` | Auto-checkpoint before every agent file modification |
| `sota.checkpoints.retentionMaxAge` | number | `604800000` | Max checkpoint age in ms (default: 7 days) |
| `sota.checkpoints.retentionMaxCount` | number | `100` | Max checkpoints per session |
| `sota.checkpoints.retentionKeepFirst` | boolean | `true` | Always keep session's first checkpoint |
| `sota.checkpoints.retentionKeepLast` | boolean | `true` | Always keep session's most recent checkpoint |
| `sota.checkpoints.compressFs` | boolean | `true` | Gzip file-system checkpoint files |
| `sota.checkpoints.showInTitleBar` | boolean | `true` | Show latest checkpoint ID in title bar |
| `sota.checkpoints.maxFileSizeMb` | number | `10` | Skip files larger than this for FS checkpoints |

---

## Performance Targets

| Operation | Target | Notes |
|---|---|---|
| Checkpoint creation (Git, 5 files) | < 100ms | Using plumbing commands with temp index |
| Checkpoint creation (FS, 5 files) | < 200ms | Including gzip compression |
| Checkpoint creation (hybrid, 5 files) | < 250ms | Both mechanisms in parallel |
| Rollback (Git, 5 files) | < 150ms | `git checkout` from ref |
| Rollback (FS, 5 files) | < 300ms | Decompress and copy |
| Diff computation | < 500ms | Between any two checkpoints |
| Manifest load (100 checkpoints) | < 50ms | JSON parse |
| Prune (remove 50 checkpoints) | < 2s | Delete refs + FS cleanup |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Workspace is not a Git repository | Git checkpoints disabled; FS-only mode |
| File deleted by agent | Checkpoint stores the file content; rollback recreates it |
| File created by agent | Checkpoint records it as new; rollback deletes it |
| Agent modifies a file that has unstaged user changes | Checkpoint captures the unstaged version (what the user sees) |
| Concurrent agent modifications | Each agent gets its own session; checkpoints are serialised within a session via a lock |
| Disk space exhaustion | Checkpoint service checks available space before creation; triggers auto-prune if below 100MB |
| Corrupt Git objects | Fallback to FS mechanism for affected files; log warning |
| Shadow branch conflicts with user branch | Shadow branches use `refs/checkpoints/` namespace, which cannot conflict with `refs/heads/` |
| Rollback during an active agent task | Pause agent, rollback, resume agent with notification of state change |

---

## Cleanup and Garbage Collection

### Automatic Pruning

A background task runs every 30 minutes (configurable) and applies the retention policy:

1. Remove checkpoints older than `retentionMaxAge`
2. If a session has more than `retentionMaxCount` checkpoints, remove oldest (respecting `keepFirst` and `keepLast`)
3. Run `git gc --auto` to clean up orphaned Git objects
4. Delete empty session checkpoint directories

### Manual Cleanup

Users can trigger cleanup via:

- Command palette: "Son of Anton: Prune Checkpoints"
- Settings: adjust retention policy
- MCP tool: `checkpoints/prune` (for agent-initiated cleanup)

### Disk Usage Monitoring

The checkpoint service reports disk usage via `getStats()`:

```typescript
interface ICheckpointStats {
	readonly totalCheckpoints: number;
	readonly totalSessions: number;
	readonly gitObjectsSize: number;           // Bytes used by Git checkpoint objects
	readonly fsCheckpointsSize: number;         // Bytes used by FS checkpoint files
	readonly totalSize: number;                 // Combined
	readonly oldestCheckpoint: number;          // Timestamp
	readonly newestCheckpoint: number;          // Timestamp
}
```

This information is displayed in the Memory Browser sidebar under a "Checkpoints" section.

---

## Testing Strategy

| Test Type | What | How |
|---|---|---|
| Unit | Git plumbing operations | Temp Git repo, create checkpoints, verify refs and objects |
| Unit | FS checkpoint creation | Temp directory, create/restore files, verify content |
| Unit | Manifest serialisation | Round-trip test: create checkpoints, serialise, deserialise, verify |
| Unit | Retention policy logic | Known set of checkpoints, apply policy, verify survivors |
| Unit | Checkpoint ID generation | Verify format, uniqueness, timestamp extraction |
| Integration | End-to-end checkpoint + rollback | Create files, checkpoint, modify, rollback, verify original content |
| Integration | Hybrid checkpoint (Git + FS) | Mix of tracked and untracked files, verify both mechanisms |
| Integration | Concurrent sessions | Two agents creating checkpoints simultaneously, verify isolation |
| Integration | Mission Control display | Create checkpoints, verify task card shows correct IDs and counts |
| Performance | Benchmark creation latency | 100 checkpoints of 10 files each, measure p50/p95/p99 |
| Stress | Disk space handling | Fill disk to near capacity, verify graceful degradation |
