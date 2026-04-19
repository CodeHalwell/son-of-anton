## 2024-04-19 - Initial Journal Entry\n**Learning:** Started tracking performance learnings.\n**Action:** Will log critical optimizations here.

## 2024-04-19 - Optimizing Nested Iteration in Notebook Selection
**Learning:** When performing `.includes()` checks inside a `.filter()` operation on large arrays like notebook cell selections, the time complexity becomes O(N*M). In UI interactions that trigger often, this is a measurable bottleneck.
**Action:** Convert the target array to a `Set` and use `Set.has()` instead of `Array.prototype.includes()` to reduce the time complexity to O(N+M).
