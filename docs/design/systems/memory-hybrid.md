# Hybrid Memory — Design Spec

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-10
**Tier:** 1 (new files alongside core)

---

## Overview

Son of Anton's memory system provides tri-modal retrieval — vector (semantic), graph (structural), and keyword (exact) — unified behind a single query interface. The system is local-first: it works immediately on any machine using SQLite, with no Docker, no external services, and zero configuration. When the Docker Compose stack is running, the memory layer transparently upgrades to FalkorDB and Qdrant for higher performance and richer query capabilities.

This design ensures that Son of Anton is useful out of the box while rewarding users who deploy the full infrastructure.

---

## Design Principles

1. **Local-first** — SQLite is the default. No internet connection, no Docker, no API keys required.
2. **Transparent upgrade** — Switching from SQLite to Docker services requires no code changes in agents or consumers. The `IMemoryStore` interface is the same.
3. **Tri-modal retrieval** — Every query can leverage semantic similarity, structural relationships, and exact text matching. The retrieval pipeline fuses results from all three.
4. **Workspace-scoped** — Each workspace has its own memory database. No cross-workspace data leakage.
5. **Agent-attributed** — Every memory entry records which agent created or modified it, enabling provenance tracking.

---

## Local-First Backend (SQLite)

### Database File

A single SQLite database at `.son-of-anton/memory.db` in the workspace root. Created automatically on first use.

### Schema

```sql
-- Vector store: embeddings for semantic search
CREATE TABLE IF NOT EXISTS vectors (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding BLOB NOT NULL,        -- float32 array via sqlite-vec
    source_type TEXT NOT NULL,       -- 'code' | 'summary' | 'patch' | 'command' | 'decision'
    source_path TEXT,                -- file path or identifier
    agent_id TEXT,                   -- which agent created this entry
    created_at INTEGER NOT NULL,     -- unix timestamp
    updated_at INTEGER NOT NULL,
    metadata TEXT                    -- JSON blob for extensibility
);

-- Graph store: nodes and edges for structural relationships
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,              -- 'function' | 'class' | 'module' | 'file' | 'symbol' | 'concept'
    name TEXT NOT NULL,
    file_path TEXT,
    start_line INTEGER,
    end_line INTEGER,
    properties TEXT,                 -- JSON blob
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,          -- 'calls' | 'imports' | 'extends' | 'implements' | 'uses' | 'contains'
    weight REAL DEFAULT 1.0,
    properties TEXT,                 -- JSON blob
    created_at INTEGER NOT NULL,
    UNIQUE(source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON graph_edges(relation);
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON graph_nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON graph_nodes(file_path);

-- Keyword store: FTS5 for exact and fuzzy text search
CREATE VIRTUAL TABLE IF NOT EXISTS keyword_index USING fts5(
    id,
    content,
    source_type,
    source_path,
    agent_id,
    tokenize='porter unicode61'
);

-- Episodic memory: session decisions and rationale
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,            -- 'decision' | 'rationale' | 'observation' | 'error'
    content TEXT NOT NULL,
    context TEXT,                    -- JSON: related file paths, symbols, etc.
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_episodes_agent ON episodes(agent_id);
```

### Vector Search with sqlite-vec

The [sqlite-vec](https://github.com/asg017/sqlite-vec) extension provides vector similarity search directly in SQLite:

```sql
-- Create the virtual table for vector indexing
CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
    id TEXT PRIMARY KEY,
    embedding float[1536]           -- matches embedding model dimension
);

-- Query: find top-k similar vectors
SELECT v.id, v.content, v.source_type, v.source_path, v.metadata,
       vec_distance_cosine(vi.embedding, :query_embedding) AS distance
FROM vec_index vi
JOIN vectors v ON vi.id = v.id
ORDER BY distance ASC
LIMIT :k;
```

### Embedding Generation

Embeddings are generated locally using a small model bundled with the extension:

- **Default model:** `all-MiniLM-L6-v2` via ONNX Runtime (384 dimensions)
- **Optional upgrade:** When an Anthropic API key is available, use `voyage-code-3` (1024 dimensions) for higher quality code embeddings
- **Fallback:** If no embedding model is available, vector search is disabled; only graph and keyword search are active
- **Configuration:** `sota.memory.embeddingModel` setting to choose model

### Graph Queries in SQLite

Without Cypher, graph traversal is implemented via recursive CTEs:

```sql
-- Find all symbols reachable from a given node within 3 hops
WITH RECURSIVE reachable(id, depth, path) AS (
    SELECT :start_id, 0, :start_id
    UNION ALL
    SELECT e.target_id, r.depth + 1, r.path || ' -> ' || e.target_id
    FROM reachable r
    JOIN graph_edges e ON r.id = e.source_id
    WHERE r.depth < :max_depth
      AND r.path NOT LIKE '%' || e.target_id || '%'  -- cycle prevention
)
SELECT DISTINCT gn.*, r.depth, r.path
FROM reachable r
JOIN graph_nodes gn ON r.id = gn.id
ORDER BY r.depth ASC;
```

---

## Docker Upgrade (FalkorDB + Qdrant)

### Detection

On startup and periodically (every 60s), the memory service checks:

1. Is Docker running? (`docker info`)
2. Is the Son of Anton Docker Compose stack up? (check `http://localhost:6333/readyz` for Qdrant, `redis-cli PING` on port 6379 for FalkorDB)
3. If both are healthy, switch the backend from SQLite to Docker services

The switch is transparent to all consumers of `IMemoryStore`.

### FalkorDB (Graph)

- **Connection:** Redis protocol on `localhost:6379`
- **Graph name:** `son-of-anton` (per-workspace graph via namespace prefix)
- **Query language:** Cypher (OpenCypher subset)
- **Advantages over SQLite:** Native graph traversal, pattern matching, variable-length path queries, better performance on large graphs

```cypher
// Example: Find all callers of a function within 3 hops
MATCH (caller)-[:CALLS*1..3]->(target:Function {name: $functionName})
RETURN caller.name, caller.file_path, length(path) AS depth
ORDER BY depth ASC
```

### Qdrant (Vector)

- **Connection:** gRPC on `localhost:6334`, REST on `localhost:6333`
- **Collection name:** `son-of-anton-<workspace-hash>`
- **Index type:** HNSW with cosine distance
- **Advantages over sqlite-vec:** Filtering during search (not post-search), payload indexing, quantisation for memory efficiency, multi-vector support

```typescript
// Example: Semantic search with metadata filter
const results = await qdrantClient.search('son-of-anton-abc123', {
	vector: queryEmbedding,
	filter: {
		must: [
			{ key: 'source_type', match: { value: 'code' } },
			{ key: 'source_path', match: { any: relevantPaths } }
		]
	},
	limit: 10,
	with_payload: true
});
```

### Migration: SQLite to Docker

When the Docker stack becomes available for the first time in a workspace that has existing SQLite data:

1. **Detect** existing `.son-of-anton/memory.db`
2. **Prompt** user: "Docker services detected. Migrate memory to FalkorDB + Qdrant for improved performance? (SQLite data will be preserved as backup)"
3. **Bulk load** graph nodes and edges into FalkorDB via batched `CREATE` statements
4. **Bulk upload** vectors to Qdrant via batch upsert API
5. **Keyword index** remains in SQLite (FTS5 is already excellent for this use case)
6. **Rename** original database to `memory.db.sqlite-backup`
7. **Mark** migration as complete in `.son-of-anton/memory-config.json`

Migration is idempotent. If interrupted, it resumes from the last checkpoint.

---

## Retrieval Pipeline

Every memory query goes through a four-stage pipeline that fuses results from all three modalities:

```
                          ┌─────────────────────┐
                          │    User/Agent Query  │
                          └──────────┬──────────┘
                                     │
                          ┌──────────v──────────┐
                          │   Query Analyser     │
                          │   (classify intent,  │
                          │    extract entities)  │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
           ┌───────v───────┐ ┌──────v──────┐ ┌──────v──────┐
           │ Vector Store  │ │ Graph Store │ │ Keyword     │
           │ (semantic     │ │ (structural │ │ Index       │
           │  anchors)     │ │  traversal) │ │ (exact      │
           │               │ │             │ │  matches)   │
           └───────┬───────┘ └──────┬──────┘ └──────┬──────┘
                   │                │                │
                   └────────────────┼────────────────┘
                                    │
                          ┌─────────v─────────┐
                          │ Context Synthesiser│
                          │ (rank, deduplicate,│
                          │  assemble context) │
                          └─────────┬─────────┘
                                    │
                          ┌─────────v─────────┐
                          │   Ranked Context   │
                          │   → LLM Prompt     │
                          └───────────────────┘
```

### Stage 1: Query Analyser

- Classifies query intent: `semantic` (conceptual), `structural` (relationships), `exact` (specific string), `hybrid` (all)
- Extracts entities: function names, class names, file paths, keywords
- Determines which backends to query (can skip irrelevant ones for performance)

### Stage 2: Parallel Retrieval

All three backends are queried in parallel:

| Backend | Input | Output | Latency Target |
|---|---|---|---|
| Vector store | Query embedding | Top-k semantically similar entries with scores | < 50ms (SQLite), < 20ms (Qdrant) |
| Graph store | Extracted entities | Subgraph of related nodes within N hops | < 100ms (SQLite), < 30ms (FalkorDB) |
| Keyword index | Raw query text + extracted keywords | FTS5 ranked matches | < 20ms |

### Stage 3: Context Synthesiser

The synthesiser merges results from all three backends:

1. **Deduplicate** — Same content from multiple backends is merged, keeping the highest score
2. **Score normalisation** — Each backend's scores are normalised to [0, 1] range
3. **Weighted fusion** — Final score = `(vector_weight * vector_score) + (graph_weight * graph_score) + (keyword_weight * keyword_score)`
4. **Default weights:** Vector 0.4, Graph 0.35, Keyword 0.25 (configurable via `sota.memory.fusionWeights`)
5. **Context budget** — Results are truncated to fit within the LLM's context budget (configurable, default 8000 tokens)
6. **Source attribution** — Each result retains its source (`vector`, `graph`, `keyword`, or `multi`) for transparency

### Stage 4: Output

The ranked, deduplicated context is formatted and injected into the LLM prompt. The Memory Browser sidebar shows the retrieval results with source attribution so users can inspect what context the agent is working with.

---

## What Gets Stored

### Code Structure (from Tree-sitter + LSIF/SCIP)

| Entry Type | Source | Storage |
|---|---|---|
| Functions, classes, methods | Tree-sitter AST | Graph nodes |
| Import relationships | Tree-sitter | Graph edges (relation: `imports`) |
| Call graphs | LSIF/SCIP | Graph edges (relation: `calls`) |
| Type hierarchies | LSIF/SCIP | Graph edges (relation: `extends`, `implements`) |
| File structure | File system | Graph nodes (kind: `file`, `module`) |
| Symbol embeddings | Embedding model | Vector store |

### Past Patches

| Entry Type | Trigger | Storage |
|---|---|---|
| Diff content | Agent modifies a file | Vector store (embedded diff text) |
| Patch metadata | Agent modifies a file | Keyword index (file path, agent ID, timestamp) |
| Outcome | Build/test result after patch | Episode (action: `observation`) |
| Relationship | Patch -> affected symbols | Graph edges (relation: `modifies`) |

### Architectural Summaries

| Entry Type | Trigger | Storage |
|---|---|---|
| Module summary | First indexing of a directory | Vector store + keyword index |
| Architecture decision | Agent or user creates a spec | Episode (action: `decision`) |
| Design rationale | Agent explains a choice | Episode (action: `rationale`) |

### Verified Commands

| Entry Type | Trigger | Storage |
|---|---|---|
| Build command | Successful `npm run build`, `cargo build`, etc. | Keyword index + episode |
| Test command | Successful test execution | Keyword index + episode |
| Run command | Successful application launch | Keyword index + episode |

### Episodic Memory

| Entry Type | Trigger | Storage |
|---|---|---|
| Session decision | Agent makes a non-trivial choice | Episode |
| Error and recovery | Agent encounters and resolves an error | Episode |
| User feedback | User approves/rejects agent action | Episode |
| Context snapshot | End of agent task | Episode (links to related entries via context JSON) |

---

## Interfaces

### IMemoryStore

```typescript
interface IMemoryStore extends IDisposable {
	readonly backend: 'sqlite' | 'docker';

	// Unified query
	query(query: IMemoryQuery): Promise<IMemoryResult[]>;

	// Direct store operations
	storeVector(entry: IVectorEntry): Promise<string>;
	storeNode(node: IGraphNode): Promise<string>;
	storeEdge(edge: IGraphEdge): Promise<string>;
	storeKeyword(entry: IKeywordEntry): Promise<string>;
	storeEpisode(episode: IEpisode): Promise<string>;

	// Update and delete
	update(id: string, updates: Partial<IMemoryEntry>): Promise<void>;
	delete(id: string): Promise<void>;

	// Bulk operations
	bulkStore(entries: IMemoryEntry[]): Promise<string[]>;
	bulkDelete(ids: string[]): Promise<void>;

	// Maintenance
	reindex(): Promise<void>;
	vacuum(): Promise<void>;
	getStats(): Promise<IMemoryStats>;

	// Events
	onDidChangeBackend: Event<'sqlite' | 'docker'>;
}
```

### IMemoryQuery

```typescript
interface IMemoryQuery {
	readonly text: string;
	readonly type: 'semantic' | 'structural' | 'exact' | 'hybrid';

	// Optional filters
	readonly sourceTypes?: Array<'code' | 'summary' | 'patch' | 'command' | 'decision'>;
	readonly filePaths?: string[];
	readonly agentIds?: string[];
	readonly dateRange?: { from: number; to: number };

	// Control
	readonly maxResults?: number;             // default: 20
	readonly contextBudgetTokens?: number;    // default: 8000
	readonly fusionWeights?: { vector: number; graph: number; keyword: number };
}
```

### IMemoryResult

```typescript
interface IMemoryResult {
	readonly id: string;
	readonly content: string;
	readonly score: number;                    // 0.0 to 1.0, normalised
	readonly source: 'vector' | 'graph' | 'keyword' | 'multi';
	readonly sourceType: string;               // 'code' | 'summary' | 'patch' | etc.
	readonly sourcePath?: string;
	readonly agentId?: string;
	readonly metadata?: Record<string, unknown>;
	readonly graphContext?: IGraphContext;      // populated when graph traversal contributed
}

interface IGraphContext {
	readonly nodes: IGraphNode[];
	readonly edges: IGraphEdge[];
	readonly traversalDepth: number;
}
```

### Supporting Types

```typescript
interface IVectorEntry {
	readonly content: string;
	readonly sourceType: string;
	readonly sourcePath?: string;
	readonly agentId?: string;
	readonly metadata?: Record<string, unknown>;
}

interface IGraphNode {
	readonly id?: string;                      // auto-generated if omitted
	readonly kind: 'function' | 'class' | 'module' | 'file' | 'symbol' | 'concept';
	readonly name: string;
	readonly filePath?: string;
	readonly startLine?: number;
	readonly endLine?: number;
	readonly properties?: Record<string, unknown>;
}

interface IGraphEdge {
	readonly sourceId: string;
	readonly targetId: string;
	readonly relation: 'calls' | 'imports' | 'extends' | 'implements' | 'uses' | 'contains' | 'modifies';
	readonly weight?: number;
	readonly properties?: Record<string, unknown>;
}

interface IKeywordEntry {
	readonly content: string;
	readonly sourceType: string;
	readonly sourcePath?: string;
	readonly agentId?: string;
}

interface IEpisode {
	readonly sessionId: string;
	readonly agentId: string;
	readonly action: 'decision' | 'rationale' | 'observation' | 'error';
	readonly content: string;
	readonly context?: Record<string, unknown>;
}

interface IMemoryStats {
	readonly backend: 'sqlite' | 'docker';
	readonly vectorCount: number;
	readonly nodeCount: number;
	readonly edgeCount: number;
	readonly keywordEntryCount: number;
	readonly episodeCount: number;
	readonly databaseSizeBytes: number;
}
```

---

## File Locations

| Path | Purpose |
|---|---|
| `extensions/son-of-anton/src/memory/memoryStore.ts` | `IMemoryStore` interface and factory |
| `extensions/son-of-anton/src/memory/sqliteBackend.ts` | SQLite implementation of `IMemoryStore` |
| `extensions/son-of-anton/src/memory/dockerBackend.ts` | FalkorDB + Qdrant implementation of `IMemoryStore` |
| `extensions/son-of-anton/src/memory/backendDetector.ts` | Docker service health checking and backend switching |
| `extensions/son-of-anton/src/memory/retrievalPipeline.ts` | Four-stage retrieval pipeline |
| `extensions/son-of-anton/src/memory/contextSynthesiser.ts` | Score normalisation, deduplication, fusion |
| `extensions/son-of-anton/src/memory/queryAnalyser.ts` | Query intent classification and entity extraction |
| `extensions/son-of-anton/src/memory/embeddingService.ts` | Embedding generation (local ONNX + optional API) |
| `extensions/son-of-anton/src/memory/migration.ts` | SQLite-to-Docker migration logic |
| `extensions/son-of-anton/src/memory/indexer.ts` | Tree-sitter / LSIF integration for populating memory |
| `services/memory-service/` | Optional standalone memory service (for advanced deployments) |

---

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `sota.memory.backend` | string | `'auto'` | `'auto'` (detect Docker), `'sqlite'`, or `'docker'` |
| `sota.memory.embeddingModel` | string | `'all-MiniLM-L6-v2'` | Embedding model to use |
| `sota.memory.embeddingDimension` | number | `384` | Must match model output dimension |
| `sota.memory.fusionWeights` | object | `{ vector: 0.4, graph: 0.35, keyword: 0.25 }` | Retrieval fusion weights |
| `sota.memory.contextBudgetTokens` | number | `8000` | Max tokens in retrieved context |
| `sota.memory.maxResults` | number | `20` | Max results per query |
| `sota.memory.graphTraversalDepth` | number | `3` | Max hops in graph traversal |
| `sota.memory.autoIndex` | boolean | `true` | Automatically index workspace on open |
| `sota.memory.indexIgnore` | string[] | `['node_modules', '.git', 'dist', 'out']` | Directories to skip during indexing |

---

## Performance Targets

| Operation | SQLite Target | Docker Target |
|---|---|---|
| Hybrid query (all 3 backends) | < 200ms | < 80ms |
| Vector search (top-20) | < 50ms | < 20ms |
| Graph traversal (3 hops) | < 100ms | < 30ms |
| Keyword search | < 20ms | < 20ms |
| Single entry store | < 10ms | < 5ms |
| Bulk store (1000 entries) | < 2s | < 500ms |
| Full workspace index (10k files) | < 60s | < 30s |
| Database size (10k files workspace) | < 200MB | N/A (distributed) |

---

## Testing Strategy

| Test Type | What | How |
|---|---|---|
| Unit | SQLite backend CRUD | In-memory SQLite, verify all store/query/delete operations |
| Unit | Retrieval pipeline fusion | Mock backends returning known scores, verify ranking |
| Unit | Query analyser classification | Known queries mapped to expected intents |
| Unit | Context synthesiser dedup | Overlapping results from multiple backends |
| Integration | End-to-end hybrid query | Populate all three stores, query, verify fused results |
| Integration | Backend switching | Start with SQLite, simulate Docker availability, verify transparent switch |
| Integration | Migration | Populate SQLite, run migration, verify Docker stores match |
| Performance | Benchmark suite | 10k entries, measure query latency against targets |
