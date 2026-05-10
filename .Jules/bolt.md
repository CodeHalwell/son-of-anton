
## 2024-05-10 - O(N*M) Array Filtering Anti-Pattern
**Learning:** Found multiple instances where codebase performs filtering across two potentially large arrays using `Array.prototype.includes` within `Array.prototype.filter` (e.g., `added = toKeys.filter(key => !fromKeys.includes(key))`). This causes an O(N*M) nested loop traversal, which becomes a bottleneck on larger datasets (like workspace tabs, user profiles, or notebook cells).
**Action:** Always identify cases of `arrayA.filter(x => arrayB.includes(x))` and convert `arrayB` to a `Set` first (`const setB = new Set(arrayB)`), reducing time complexity to O(N+M). Applied this optimization successfully in `userDataProfilesManifestMerge.ts` and noted it as a recurring codebase-specific performance pattern.
