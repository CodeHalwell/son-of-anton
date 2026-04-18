## $(date +%Y-%m-%d) - Optimize Notebook Cell Selection Performance
**Learning:** In UI selection operations that filter current selection arrays against a range array (e.g., in `notebookEditorWidget.ts` via `_toggleNotebookCellSelection`), using `.includes()` inside `.filter()` leads to O(M*N) time complexity, which causes measurable UI lag when dealing with thousands of elements like Notebook cells.
**Action:** When filtering one array against another large array, convert the secondary array into a `Set` before the loop and use `Set.has()` to drop the complexity to O(M+N).
