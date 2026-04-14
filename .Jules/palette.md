# Palette's Journal

## 2024-05-18 - Missing ARIA labels in basic components
**Learning:** Found several base components missing basic ARIA properties when acting as inputs, tabs, or lists. Missing `aria-label` properties specifically can be found on `SelectBox` elements or specific `ActionViewItem`s.
**Action:** Always check the `ariaLabel` implementation and look for components missing fundamental screen reader context.

## 2024-05-18 - Hover states vs focus visible
**Learning:** Many interactive components rely heavily on `:hover` states but lack corresponding keyboard focus feedback (like `.focus-visible` or equivalent logic in standard CSS).
**Action:** Remember to review the corresponding CSS when updating component focus handling.

## 2024-05-18 - Hover actions missing keyboard accessibility
**Learning:** Actions rendered inside `HoverWidget` (specifically `HoverAction`) are assigned `tabindex=0` but lack a focus ring. Since hover actions are focusable and triggered by keyboard (`Enter`/`Space`), they need clear visual indication when focused.
**Action:** Add `.focus-visible` styles to `.action-container` or `.action-container:focus` in `hoverWidget.css` to match standard VS Code keyboard accessibility patterns.
