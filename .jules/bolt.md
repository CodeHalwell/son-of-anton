## 2024-05-18 - Batching Graph queries with UNWIND
**Learning:** Found an N+1 performance bottleneck in Cypher database operations when saving relationships for call graphs one by one. The latency linearly scales with the number of generated edges.
**Action:** When implementing repetitive query tasks using a FalkorDBClient (RedisGraph-like system), ALWAYS batch create elements using Cypher's `UNWIND` clause instead of sequential loop-based `.write()` operations to reduce write latency from O(N) to O(1).
