# Activity Bar — Design Spec

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-10
**Tier:** 2 (hooks into existing activity bar contribution points)

---

## Overview

The activity bar is the leftmost vertical strip in the IDE. VS Code's default activity bar exposes Explorer, Search, Source Control, Debug, and Extensions. Son of Anton replaces this with seven items that reflect its conceptual model: agents, code structure, memory, specs, and tool connections.

The activity bar is the most visible surface that signals "this is not VS Code." Every icon, colour, and dimension is intentional.

---

## Design Principles

1. **Narrower than VS Code** — 40px wide (VS Code default is 48px). Reclaims 8px of horizontal space and creates a tighter, more purposeful feel.
2. **Two-gold colour system** — Active items glow bright gold (#F5A623). Inactive items use muted antique gold (#B8860B). No VS Code blue (#007ACC) anywhere.
3. **Custom SVG icons** — Each icon is designed as a 20x20 SVG with 1.5px stroke weight, rendered at the centre of a 40x40 hit target.
4. **No text labels by default** — Tooltips on hover. Labels available via setting `sota.activityBar.showLabels`.

---

## Items

| Position | ID | Surface | Icon Concept | Tooltip | View Container ID |
|---|---|---|---|---|---|
| 1 | `agentTasks` | Agent Tasks | Branching node graph — three nodes connected by directed edges, the centre node slightly larger | Agent Tasks | `son-of-anton-agent-tasks` |
| 2 | `explorer` | Explorer | Folder tree — retained from VS Code but redrawn with 1.5px stroke to match the icon set | Explorer | `workbench.view.explorer` |
| 3 | `dagExplorer` | DAG Explorer | Directed graph / dependency web — five nodes in a layered DAG layout with downward-pointing edges | DAG Explorer | `son-of-anton-dag-explorer` |
| 4 | `memoryBrowser` | Memory Browser | Layered cylinders — three cylinders stacked with slight horizontal offset, representing vector/graph/keyword stores | Memory Browser | `son-of-anton-memory-browser` |
| 5 | `specDocuments` | Spec Documents | Structured document with checklist — document outline with three checkbox lines, top one checked | Spec Documents | `son-of-anton-spec-documents` |
| 6 | `mcpConnections` | MCP Connections | Plug / socket — a circular socket with two pins, representing tool connections | MCP Connections | `son-of-anton-mcp-connections` |
| 7 | `search` | Search | Magnifier — retained from VS Code but redrawn with 1.5px stroke to match the icon set | Search | `workbench.view.search` |

---

## Visual Specification

### Colour Tokens

| Token | Value | Usage |
|---|---|---|
| `activityBar.background` | `#0D0D0D` | Bar background, matches editor background |
| `activityBar.foreground` | `#F5A623` | Active icon fill/stroke |
| `activityBar.inactiveForeground` | `#B8860B` | Inactive icon fill/stroke |
| `activityBar.activeBorder` | `#F5A623` | 2px left border on active item |
| `activityBar.activeBackground` | `rgba(245, 166, 35, 0.08)` | Subtle glow behind active icon |
| `activityBar.border` | `#1A1A1A` | Right edge border separating bar from sidebar |
| `activityBarBadge.background` | `#F5A623` | Notification badge background |
| `activityBarBadge.foreground` | `#0D0D0D` | Notification badge text |

### Dimensions

| Property | Value | Notes |
|---|---|---|
| Bar width | 40px | 8px narrower than VS Code default |
| Icon size | 20x20px | Centred within the 40px width |
| Icon hit target | 40x40px | Full width, comfortable click area |
| Item vertical padding | 10px top, 10px bottom | 40px total height per item |
| Active indicator | 2px solid left border | Full height of the item |
| Separator (between items 5 and 6) | 1px horizontal line, `#1A1A1A` | Visual grouping: workspace items above, tool items below |

### Icon Design Rules

All icons follow a consistent visual language:

- **Stroke weight:** 1.5px
- **Stroke colour:** Inherits from `currentColor` (controlled by foreground tokens above)
- **Fill:** None (outline style only)
- **Corner radius:** 1px on sharp corners
- **Canvas:** 20x20 viewBox
- **Style:** Geometric, minimal, no decorative flourishes

### Hover State

- Icon transitions from inactive gold (#B8860B) to active gold (#F5A623) over 150ms ease-out
- Background: `rgba(245, 166, 35, 0.04)` — barely visible warmth
- Tooltip appears after 500ms delay, positioned to the right of the bar

### Active State

- Left border: 2px solid #F5A623
- Background: `rgba(245, 166, 35, 0.08)`
- Icon colour: #F5A623

### Drag and Drop

- Users can reorder activity bar items via drag and drop (VS Code built-in behaviour, retained)
- Custom items maintain their view container bindings regardless of position

---

## Icon SVG Specifications

### 1. Agent Tasks — Branching Node Graph

```svg
<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Centre node (larger) -->
  <circle cx="10" cy="10" r="3" />
  <!-- Top-left node -->
  <circle cx="4" cy="4" r="2" />
  <!-- Top-right node -->
  <circle cx="16" cy="4" r="2" />
  <!-- Bottom node -->
  <circle cx="10" cy="17" r="2" />
  <!-- Edges -->
  <line x1="5.4" y1="5.4" x2="8" y2="8" />
  <line x1="14.6" y1="5.4" x2="12" y2="8" />
  <line x1="10" y1="13" x2="10" y2="15" />
</svg>
```

### 2. Explorer — Folder Tree

Redrawn version of VS Code's explorer icon with 1.5px strokes. Folder with nested document outline.

### 3. DAG Explorer — Directed Graph

```svg
<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Layer 1 (top) -->
  <circle cx="10" cy="3" r="2" />
  <!-- Layer 2 (middle) -->
  <circle cx="5" cy="10" r="2" />
  <circle cx="15" cy="10" r="2" />
  <!-- Layer 3 (bottom) -->
  <circle cx="3" cy="17" r="2" />
  <circle cx="10" cy="17" r="2" />
  <!-- Edges (directed downward) -->
  <line x1="9" y1="5" x2="6" y2="8" />
  <line x1="11" y1="5" x2="14" y2="8" />
  <line x1="4" y1="12" x2="3.5" y2="15" />
  <line x1="6" y1="12" x2="9.5" y2="15" />
</svg>
```

### 4. Memory Browser — Layered Cylinders

```svg
<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Back cylinder (keyword) -->
  <ellipse cx="12" cy="5" rx="5" ry="1.5" />
  <line x1="7" y1="5" x2="7" y2="9" />
  <line x1="17" y1="5" x2="17" y2="9" />
  <ellipse cx="12" cy="9" rx="5" ry="1.5" />
  <!-- Middle cylinder (graph), offset left -->
  <ellipse cx="10" cy="8" rx="5" ry="1.5" />
  <line x1="5" y1="8" x2="5" y2="12" />
  <line x1="15" y1="8" x2="15" y2="12" />
  <ellipse cx="10" cy="12" rx="5" ry="1.5" />
  <!-- Front cylinder (vector), offset left again -->
  <ellipse cx="8" cy="11" rx="5" ry="1.5" />
  <line x1="3" y1="11" x2="3" y2="15" />
  <line x1="13" y1="11" x2="13" y2="15" />
  <ellipse cx="8" cy="15" rx="5" ry="1.5" />
</svg>
```

### 5. Spec Documents — Document with Checklist

```svg
<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Document outline -->
  <rect x="3" y="1" width="14" height="18" rx="1" />
  <!-- Checklist line 1 (checked) -->
  <polyline points="6,6 7,7.5 9,5" />
  <line x1="11" y1="6" x2="15" y2="6" />
  <!-- Checklist line 2 (unchecked) -->
  <rect x="6" y="9" width="3" height="2" rx="0.5" />
  <line x1="11" y1="10" x2="15" y2="10" />
  <!-- Checklist line 3 (unchecked) -->
  <rect x="6" y="13" width="3" height="2" rx="0.5" />
  <line x1="11" y1="14" x2="15" y2="14" />
</svg>
```

### 6. MCP Connections — Plug / Socket

```svg
<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- Socket circle -->
  <circle cx="10" cy="10" r="7" />
  <!-- Two pins -->
  <line x1="7" y1="7" x2="7" y2="10" />
  <line x1="13" y1="7" x2="13" y2="10" />
  <!-- Ground slot -->
  <line x1="10" y1="12" x2="10" y2="14" />
</svg>
```

### 7. Search — Magnifier

Redrawn version of VS Code's search icon with 1.5px strokes. Circle with angled handle extending to bottom-right.

---

## View Containers

Each activity bar item opens a corresponding view container in the sidebar. View containers are registered in the extension's `package.json`:

```jsonc
"contributes": {
  "viewsContainers": {
    "activitybar": [
      {
        "id": "son-of-anton-agent-tasks",
        "title": "Agent Tasks",
        "icon": "resources/icons/agent-tasks.svg"
      },
      {
        "id": "son-of-anton-dag-explorer",
        "title": "DAG Explorer",
        "icon": "resources/icons/dag-explorer.svg"
      },
      {
        "id": "son-of-anton-memory-browser",
        "title": "Memory Browser",
        "icon": "resources/icons/memory-browser.svg"
      },
      {
        "id": "son-of-anton-spec-documents",
        "title": "Spec Documents",
        "icon": "resources/icons/spec-documents.svg"
      },
      {
        "id": "son-of-anton-mcp-connections",
        "title": "MCP Connections",
        "icon": "resources/icons/mcp-connections.svg"
      }
    ]
  }
}
```

Explorer and Search reuse VS Code's built-in view containers (`workbench.view.explorer`, `workbench.view.search`) with restyled icons injected via the icon theme.

---

## Implementation Plan

### File Locations

| File | Purpose |
|---|---|
| `resources/icons/agent-tasks.svg` | Agent Tasks icon |
| `resources/icons/dag-explorer.svg` | DAG Explorer icon |
| `resources/icons/memory-browser.svg` | Memory Browser icon |
| `resources/icons/spec-documents.svg` | Spec Documents icon |
| `resources/icons/mcp-connections.svg` | MCP Connections icon |
| `resources/icons/explorer.svg` | Restyled Explorer icon |
| `resources/icons/search.svg` | Restyled Search icon |
| `extensions/son-of-anton/package.json` | View container and view registrations |
| `extensions/son-of-anton/src/views/` | TreeDataProvider implementations for each view |
| `extensions/son-of-anton/themes/son-of-anton-color-theme.json` | Colour token overrides |

### Steps

1. **Create SVG icons** in `resources/icons/`. Follow the 20x20 viewBox, 1.5px stroke, `currentColor` convention.
2. **Register view containers** in the extension's `package.json` contributes section.
3. **Register views** within each container (at minimum one tree view per container).
4. **Implement TreeDataProviders** for Agent Tasks, DAG Explorer, Memory Browser, Spec Documents, and MCP Connections.
5. **Override colour tokens** in the Son of Anton colour theme to apply the two-gold system.
6. **Override activity bar width** via CSS in the sessions workbench layer. Target selector: `.monaco-workbench .activitybar`. Set `width: 40px` and adjust sidebar left offset accordingly.
7. **Hide default activity bar items** that are not in the seven-item list (Source Control, Debug, Extensions) by not contributing views to those containers. Users can re-enable them via settings.

### Width Override (Tier 2 Hook)

The 40px width requires a CSS override in the sessions workbench. This is a Tier 2 change because it hooks into the existing layout system:

```css
/* src/vs/sessions/browser/media/activitybar-override.css */
.monaco-workbench .activitybar {
	width: 40px !important;
	min-width: 40px !important;
}

.monaco-workbench .activitybar .action-item .action-label {
	width: 40px !important;
	height: 40px !important;
	line-height: 40px !important;
}
```

The layout service must also be informed of the new width. Register a layout override in the sessions workbench initialisation to set `ACTIVITY_BAR_WIDTH = 40`.

---

## Accessibility

- All icons have `aria-label` attributes matching their tooltip text
- Focus order follows visual order (top to bottom)
- Keyboard navigation: Tab moves focus into the activity bar, arrow keys move between items, Enter/Space activates
- High contrast theme: icons use `#FFFFFF` for active and `#999999` for inactive (overrides gold tokens)
- Badge counts announced via `aria-live` region

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `sota.activityBar.showLabels` | boolean | `false` | Show text labels below icons |
| `sota.activityBar.hiddenItems` | string[] | `[]` | IDs of items to hide from the bar |
| `sota.activityBar.width` | number | `40` | Bar width in pixels (32-64 range) |
