## 2024-04-22 - O(N*M) nested iterations in array filtering for notebook cell selections
**Learning:** Checking for element presence with `Array.prototype.includes()` inside an `Array.prototype.filter()` callback over another large array creates an O(N*M) time complexity bottleneck. This occurs in UI selection logic like notebook cell selections, blocking the main thread when many elements are involved.
**Action:** When filtering a large array against another large array, always convert the target array to a `Set` first and use `Set.has()` instead of `includes()`. This reduces time complexity to O(N+M).

## 2024-05-24 - N+1 Query Problem in Cypher
**Learning:** Found a major N+1 query loop in `services/indexer/src/writers/graphWriter.ts` inside `writeCallSites`, mapping array of calls to sequential db writes. Replaced with `UNWIND`. When testing optimizations with scratchpad benchmark files, always remove them before creating PR to avoid repository pollution and failing code review constraints.
**Action:** Always clean up local scratchpads and benchmark files. Cypher batch modifications are very safe for these graphs when implemented exactly matching original mapping logic.

## 2024-05-25 - O(N*M) lookups in Git optimistic updates
**Learning:** Found nested loops during Git operations (`add`, `revert`, `clean`) when comparing file resource URI paths in array filter closures using `includes()`. This O(N*M) issue is similar to the notebook cells problem, proving this is a recurring codebase-specific performance pattern in extensions when dealing with file resources.
**Action:** When working on extension host array manipulations, especially with large amounts of workspace resource strings (URIs), instinctively apply the `Set.has()` optimization.

## 2024-05-26 - O(N*M) nested iterations in array filtering for configuration merging
**Learning:** Found O(N*M) time complexity bottlenecks in `src/vs/platform/configuration/common/configurationModels.ts` where arrays of configuration identifiers and keys were filtered using `includes()` and `indexOf()` against other arrays.
**Action:** When filtering an array based on the presence of its elements in another array, convert the target array to a `Set` first to reduce lookup time from O(N) to O(1), bringing the total time complexity from O(N*M) to O(N+M). This optimization pattern is crucial for performance across the codebase where operations like `filter(item => !otherArray.includes(item))` are present.
