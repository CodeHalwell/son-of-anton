# Son of Anton — Visual Identity Design Specification

**Version:** 1.0
**Status:** Draft
**Date:** 2026-03-10
**Modification tier:** Tier 1 (new files alongside core)
**Parent spec:** [v2 Architectural Overview](../son-of-anton-v2-overview.md)

---

## Overview

This specification defines the complete visual identity for Son of Anton. The goal is to make the IDE immediately unrecognisable as a VS Code fork through a cohesive dark + amber/gold aesthetic, custom typography, bespoke iconography, and deliberate elimination of every VS Code visual signature.

Gold is not accent. Gold is structural. It appears in borders, gutter indicators, DAG edges, cursor highlights, and tab states. The near-black backgrounds create depth through subtle gradation rather than VS Code's flat grey-on-grey.

---

## 1. Color System

### 1.1 Token Table

Every color in Son of Anton is defined as a CSS custom property. These tokens are the single source of truth for the theme JSON, shared stylesheets, and webview surfaces.

| Token | Value | Usage |
|---|---|---|
| `--soa-bg-primary` | `#0D0D0D` | Editor background, main surfaces |
| `--soa-bg-secondary` | `#111111` | Mission Control canvas, panel backgrounds |
| `--soa-bg-elevated` | `#161616` | Cards, floating panels, spec doc surfaces, dropdowns |
| `--soa-bg-hover` | `#1A1A1A` | Hover states, active tabs, selected list items |
| `--soa-bg-input` | `#141414` | Input fields, text areas, search boxes |
| `--soa-bg-widget` | `#1C1C1C` | Command palette, quick pick, suggest widget |
| `--soa-bg-canvas` | `#0A0A0A` | DAG Explorer canvas, title bar |
| `--soa-border-default` | `#2A2A2A` | Panel borders, card outlines, tab borders |
| `--soa-border-subtle` | `#1E1E1E` | Gutter separators, inactive dividers |
| `--soa-border-strong` | `#3A3A3A` | Active panel borders, focused input borders |
| `--soa-gold-primary` | `#F5A623` | Interactive, active, selected, focus ring |
| `--soa-gold-secondary` | `#B8860B` | Structural chrome, inactive indicators, line numbers |
| `--soa-gold-dim` | `#C8962A` | Syntax highlights, EARS keywords, breadcrumbs |
| `--soa-gold-glow` | `#F5A62333` | Glow effects, active node shadows (20% opacity) |
| `--soa-gold-selection` | `#F5A62326` | Editor selection highlight (15% opacity) |
| `--soa-gold-find` | `#F5A62340` | Find match highlight (25% opacity) |
| `--soa-text-primary` | `#E8E8E8` | Body text, editor content, active labels |
| `--soa-text-secondary` | `#888888` | Labels, breadcrumbs, inactive tab text |
| `--soa-text-muted` | `#555555` | Timestamps, metadata, placeholder text |
| `--soa-text-inverse` | `#0D0D0D` | Text on gold backgrounds (badges, buttons) |
| `--soa-status-success` | `#2A5A2A` | Test pass, build success backgrounds |
| `--soa-status-success-fg` | `#4EC964` | Success text and icons |
| `--soa-status-error` | `#5A2A2A` | Test fail, build error backgrounds |
| `--soa-status-error-fg` | `#F85149` | Error text and icons |
| `--soa-status-warning` | `#5A4A0A` | Warning backgrounds |
| `--soa-status-warning-fg` | `#D4A017` | Warning text and icons |
| `--soa-status-info` | `#1A3A5A` | Informational backgrounds |
| `--soa-status-info-fg` | `#6CB4EE` | Informational text and icons |

### 1.2 Forbidden Colors

The following colors and their variants must never appear in Son of Anton chrome:

| Forbidden | Hex | Reason |
|---|---|---|
| VS Code blue | `#007ACC` | Primary VS Code brand color |
| VS Code link blue | `#4daafc` | VS Code hyperlink color |
| VS Code button blue | `#0078D4` | VS Code button / focus color |
| VS Code hover blue | `#026EC1` | VS Code button hover |
| VS Code selection blue | `#264F78` | VS Code editor selection |
| VS Code badge blue | `#1E9BE0` | VS Code notification badges |

**Replacement rule:** Anywhere VS Code uses blue for interactive states, Son of Anton uses `--soa-gold-primary` (`#F5A623`). Anywhere VS Code uses blue for structural/inactive chrome, Son of Anton uses `--soa-gold-secondary` (`#B8860B`).

### 1.3 CSS Custom Properties Stylesheet

File: `src/vs/sessions/contrib/theme/browser/colorTokens.css`

```css
:root {
	/* Backgrounds */
	--soa-bg-primary: #0D0D0D;
	--soa-bg-secondary: #111111;
	--soa-bg-elevated: #161616;
	--soa-bg-hover: #1A1A1A;
	--soa-bg-input: #141414;
	--soa-bg-widget: #1C1C1C;
	--soa-bg-canvas: #0A0A0A;

	/* Borders */
	--soa-border-default: #2A2A2A;
	--soa-border-subtle: #1E1E1E;
	--soa-border-strong: #3A3A3A;

	/* Gold system */
	--soa-gold-primary: #F5A623;
	--soa-gold-secondary: #B8860B;
	--soa-gold-dim: #C8962A;
	--soa-gold-glow: #F5A62333;
	--soa-gold-selection: #F5A62326;
	--soa-gold-find: #F5A62340;

	/* Text */
	--soa-text-primary: #E8E8E8;
	--soa-text-secondary: #888888;
	--soa-text-muted: #555555;
	--soa-text-inverse: #0D0D0D;

	/* Status */
	--soa-status-success: #2A5A2A;
	--soa-status-success-fg: #4EC964;
	--soa-status-error: #5A2A2A;
	--soa-status-error-fg: #F85149;
	--soa-status-warning: #5A4A0A;
	--soa-status-warning-fg: #D4A017;
	--soa-status-info: #1A3A5A;
	--soa-status-info-fg: #6CB4EE;
}
```

---

## 2. Theme Implementation

### 2.1 Theme File Location

Primary theme file: `extensions/son-of-anton/themes/son-of-anton-dark.json`

This file is contributed via the extension's `package.json`:

```jsonc
{
	"contributes": {
		"themes": [
			{
				"label": "Son of Anton Dark",
				"uiTheme": "vs-dark",
				"path": "./themes/son-of-anton-dark.json"
			},
			{
				"label": "Son of Anton High Contrast",
				"uiTheme": "hc-black",
				"path": "./themes/son-of-anton-hc.json"
			}
		]
	}
}
```

### 2.2 Workbench Color Customizations

The complete theme JSON file. Every color that VS Code exposes as a workbench color is mapped to the Son of Anton token system. No blue survives.

File: `extensions/son-of-anton/themes/son-of-anton-dark.json`

```jsonc
{
	"$schema": "vscode://schemas/color-theme",
	"name": "Son of Anton Dark",
	"type": "dark",
	"colors": {
		// ── Editor ──────────────────────────────────────────────
		"editor.background": "#0D0D0D",
		"editor.foreground": "#E8E8E8",
		"editor.lineHighlightBackground": "#1A1A1A40",
		"editor.lineHighlightBorder": "#F5A62320",
		"editor.selectionBackground": "#F5A62326",
		"editor.selectionHighlightBackground": "#F5A62315",
		"editor.inactiveSelectionBackground": "#F5A62315",
		"editor.wordHighlightBackground": "#F5A62320",
		"editor.wordHighlightStrongBackground": "#F5A62330",
		"editor.findMatchBackground": "#F5A62340",
		"editor.findMatchHighlightBackground": "#F5A62320",
		"editor.findRangeHighlightBackground": "#F5A62310",
		"editor.hoverHighlightBackground": "#F5A62315",
		"editor.rangeHighlightBackground": "#F5A62310",
		"editorCursor.foreground": "#F5A623",
		"editorBracketMatch.background": "#F5A62320",
		"editorBracketMatch.border": "#F5A623",
		"editorBracketHighlight.foreground1": "#F5A623",
		"editorBracketHighlight.foreground2": "#C8962A",
		"editorBracketHighlight.foreground3": "#B8860B",
		"editorBracketHighlight.foreground4": "#D4A44C",
		"editorBracketHighlight.foreground5": "#E8C273",
		"editorBracketHighlight.foreground6": "#F5A623",
		"editorIndentGuide.background1": "#1E1E1E",
		"editorIndentGuide.activeBackground1": "#3A3A3A",
		"editorLineNumber.foreground": "#B8860B",
		"editorLineNumber.activeForeground": "#F5A623",
		"editorRuler.foreground": "#1E1E1E",
		"editorWhitespace.foreground": "#2A2A2A",
		"editorOverviewRuler.border": "#0D0D0D",
		"editorOverviewRuler.findMatchForeground": "#F5A62380",
		"editorOverviewRuler.errorForeground": "#F85149",
		"editorOverviewRuler.warningForeground": "#D4A017",
		"editorOverviewRuler.infoForeground": "#6CB4EE",
		"editorLink.activeForeground": "#F5A623",
		"editorError.foreground": "#F85149",
		"editorWarning.foreground": "#D4A017",
		"editorInfo.foreground": "#6CB4EE",
		"editorHint.foreground": "#B8860B",

		// ── Editor Groups & Tabs ────────────────────────────────
		"editorGroup.border": "#2A2A2A",
		"editorGroup.dropBackground": "#F5A62320",
		"editorGroupHeader.tabsBackground": "#0D0D0D",
		"editorGroupHeader.tabsBorder": "#2A2A2A",
		"editorGroupHeader.noTabsBackground": "#0D0D0D",

		// ── Editor Widget ───────────────────────────────────────
		"editorWidget.background": "#1C1C1C",
		"editorWidget.border": "#2A2A2A",
		"editorWidget.foreground": "#E8E8E8",
		"editorSuggestWidget.background": "#1C1C1C",
		"editorSuggestWidget.border": "#2A2A2A",
		"editorSuggestWidget.foreground": "#E8E8E8",
		"editorSuggestWidget.highlightForeground": "#F5A623",
		"editorSuggestWidget.selectedBackground": "#1A1A1A",
		"editorHoverWidget.background": "#161616",
		"editorHoverWidget.border": "#2A2A2A",

		// ── Editor Gutter ───────────────────────────────────────
		"editorGutter.addedBackground": "#4EC964",
		"editorGutter.deletedBackground": "#F85149",
		"editorGutter.modifiedBackground": "#B8860B",
		"editorGutter.commentRangeForeground": "#555555",
		"editorGutter.foldingControlForeground": "#888888",

		// ── Diff Editor ─────────────────────────────────────────
		"diffEditor.insertedTextBackground": "#2A5A2A30",
		"diffEditor.insertedLineBackground": "#2A5A2A20",
		"diffEditor.removedTextBackground": "#5A2A2A30",
		"diffEditor.removedLineBackground": "#5A2A2A20",
		"diffEditor.border": "#2A2A2A",

		// ── Tabs ────────────────────────────────────────────────
		"tab.activeBackground": "#1A1A1A",
		"tab.activeBorder": "#1A1A1A",
		"tab.activeBorderTop": "#F5A623",
		"tab.activeForeground": "#E8E8E8",
		"tab.selectedBorderTop": "#F5A623",
		"tab.border": "#2A2A2A",
		"tab.hoverBackground": "#1A1A1A",
		"tab.hoverBorder": "#F5A62380",
		"tab.inactiveBackground": "#0D0D0D",
		"tab.inactiveForeground": "#888888",
		"tab.unfocusedActiveBackground": "#161616",
		"tab.unfocusedActiveBorder": "#161616",
		"tab.unfocusedActiveBorderTop": "#B8860B",
		"tab.unfocusedActiveForeground": "#888888",
		"tab.unfocusedHoverBackground": "#161616",
		"tab.unfocusedInactiveBackground": "#0D0D0D",
		"tab.unfocusedInactiveForeground": "#555555",
		"tab.lastPinnedBorder": "#B8860B",

		// ── Activity Bar ────────────────────────────────────────
		"activityBar.background": "#0A0A0A",
		"activityBar.foreground": "#F5A623",
		"activityBar.inactiveForeground": "#B8860B",
		"activityBar.border": "#1E1E1E",
		"activityBar.activeBorder": "#F5A623",
		"activityBar.activeBackground": "#1A1A1A30",
		"activityBarBadge.background": "#F5A623",
		"activityBarBadge.foreground": "#0D0D0D",

		// ── Side Bar ────────────────────────────────────────────
		"sideBar.background": "#111111",
		"sideBar.foreground": "#E8E8E8",
		"sideBar.border": "#1E1E1E",
		"sideBar.dropBackground": "#F5A62320",
		"sideBarTitle.foreground": "#E8E8E8",
		"sideBarSectionHeader.background": "#111111",
		"sideBarSectionHeader.foreground": "#E8E8E8",
		"sideBarSectionHeader.border": "#1E1E1E",

		// ── Lists & Trees ───────────────────────────────────────
		"list.activeSelectionBackground": "#1A1A1A",
		"list.activeSelectionForeground": "#F5A623",
		"list.activeSelectionIconForeground": "#F5A623",
		"list.dropBackground": "#F5A62320",
		"list.focusBackground": "#1A1A1A",
		"list.focusForeground": "#E8E8E8",
		"list.focusOutline": "#F5A623",
		"list.highlightForeground": "#F5A623",
		"list.hoverBackground": "#161616",
		"list.hoverForeground": "#E8E8E8",
		"list.inactiveSelectionBackground": "#161616",
		"list.inactiveSelectionForeground": "#E8E8E8",
		"list.inactiveFocusBackground": "#161616",
		"list.inactiveFocusOutline": "#B8860B",
		"list.errorForeground": "#F85149",
		"list.warningForeground": "#D4A017",
		"tree.indentGuidesStroke": "#2A2A2A",

		// ── Status Bar ──────────────────────────────────────────
		"statusBar.background": "#0A0A0A",
		"statusBar.foreground": "#888888",
		"statusBar.border": "#1E1E1E",
		"statusBar.debuggingBackground": "#5A4A0A",
		"statusBar.debuggingForeground": "#F5A623",
		"statusBar.debuggingBorder": "#B8860B",
		"statusBar.noFolderBackground": "#0A0A0A",
		"statusBar.noFolderForeground": "#555555",
		"statusBar.focusBorder": "#F5A623",
		"statusBarItem.activeBackground": "#F5A62330",
		"statusBarItem.hoverBackground": "#1A1A1A",
		"statusBarItem.hoverForeground": "#E8E8E8",
		"statusBarItem.focusBorder": "#F5A623",
		"statusBarItem.prominentBackground": "#1A1A1A",
		"statusBarItem.prominentForeground": "#F5A623",
		"statusBarItem.prominentHoverBackground": "#2A2A2A",
		"statusBarItem.remoteBackground": "#B8860B",
		"statusBarItem.remoteForeground": "#0D0D0D",
		"statusBarItem.errorBackground": "#5A2A2A",
		"statusBarItem.errorForeground": "#F85149",
		"statusBarItem.warningBackground": "#5A4A0A",
		"statusBarItem.warningForeground": "#D4A017",

		// ── Title Bar ───────────────────────────────────────────
		"titleBar.activeBackground": "#0A0A0A",
		"titleBar.activeForeground": "#E8E8E8",
		"titleBar.border": "#1E1E1E",
		"titleBar.inactiveBackground": "#0D0D0D",
		"titleBar.inactiveForeground": "#555555",

		// ── Buttons ─────────────────────────────────────────────
		"button.background": "#F5A623",
		"button.foreground": "#0D0D0D",
		"button.hoverBackground": "#D4901E",
		"button.border": "#F5A62340",
		"button.secondaryBackground": "#1A1A1A",
		"button.secondaryForeground": "#E8E8E8",
		"button.secondaryHoverBackground": "#2A2A2A",
		"button.separator": "#0D0D0D40",

		// ── Inputs ──────────────────────────────────────────────
		"input.background": "#141414",
		"input.border": "#2A2A2A",
		"input.foreground": "#E8E8E8",
		"input.placeholderForeground": "#555555",
		"inputOption.activeBackground": "#F5A62330",
		"inputOption.activeBorder": "#F5A623",
		"inputOption.activeForeground": "#E8E8E8",
		"inputValidation.errorBackground": "#5A2A2A",
		"inputValidation.errorBorder": "#F85149",
		"inputValidation.errorForeground": "#E8E8E8",
		"inputValidation.infoBackground": "#1A3A5A",
		"inputValidation.infoBorder": "#6CB4EE",
		"inputValidation.infoForeground": "#E8E8E8",
		"inputValidation.warningBackground": "#5A4A0A",
		"inputValidation.warningBorder": "#D4A017",
		"inputValidation.warningForeground": "#E8E8E8",

		// ── Dropdowns ───────────────────────────────────────────
		"dropdown.background": "#141414",
		"dropdown.border": "#2A2A2A",
		"dropdown.foreground": "#E8E8E8",
		"dropdown.listBackground": "#111111",

		// ── Checkboxes ──────────────────────────────────────────
		"checkbox.background": "#141414",
		"checkbox.border": "#2A2A2A",
		"checkbox.foreground": "#E8E8E8",
		"checkbox.selectBackground": "#141414",
		"checkbox.selectBorder": "#F5A623",

		// ── Scrollbar ───────────────────────────────────────────
		"scrollbar.shadow": "#00000080",
		"scrollbarSlider.activeBackground": "#F5A62360",
		"scrollbarSlider.background": "#55555540",
		"scrollbarSlider.hoverBackground": "#88888850",

		// ── Badges ──────────────────────────────────────────────
		"badge.background": "#F5A623",
		"badge.foreground": "#0D0D0D",

		// ── Progress Bar ────────────────────────────────────────
		"progressBar.background": "#F5A623",

		// ── Panel ───────────────────────────────────────────────
		"panel.background": "#111111",
		"panel.border": "#1E1E1E",
		"panel.dropBorder": "#F5A623",
		"panelInput.border": "#2A2A2A",
		"panelTitle.activeBorder": "#F5A623",
		"panelTitle.activeForeground": "#E8E8E8",
		"panelTitle.inactiveForeground": "#888888",

		// ── Notification ────────────────────────────────────────
		"notificationCenter.border": "#2A2A2A",
		"notificationCenterHeader.background": "#161616",
		"notificationCenterHeader.foreground": "#E8E8E8",
		"notifications.background": "#161616",
		"notifications.border": "#2A2A2A",
		"notifications.foreground": "#E8E8E8",
		"notificationLink.foreground": "#F5A623",
		"notificationsErrorIcon.foreground": "#F85149",
		"notificationsInfoIcon.foreground": "#6CB4EE",
		"notificationsWarningIcon.foreground": "#D4A017",

		// ── Quick Pick / Command Palette ────────────────────────
		"quickInput.background": "#161616",
		"quickInput.foreground": "#E8E8E8",
		"quickInputList.focusBackground": "#1A1A1A",
		"quickInputList.focusForeground": "#F5A623",
		"quickInputList.focusIconForeground": "#F5A623",
		"quickInputTitle.background": "#161616",
		"pickerGroup.border": "#2A2A2A",
		"pickerGroup.foreground": "#B8860B",

		// ── Peek View ───────────────────────────────────────────
		"peekView.border": "#F5A623",
		"peekViewEditor.background": "#0D0D0D",
		"peekViewEditor.matchHighlightBackground": "#F5A62340",
		"peekViewEditorGutter.background": "#0D0D0D",
		"peekViewResult.background": "#111111",
		"peekViewResult.fileForeground": "#E8E8E8",
		"peekViewResult.lineForeground": "#888888",
		"peekViewResult.matchHighlightBackground": "#F5A62340",
		"peekViewResult.selectionBackground": "#1A1A1A",
		"peekViewResult.selectionForeground": "#F5A623",
		"peekViewTitle.background": "#0A0A0A",
		"peekViewTitleDescription.foreground": "#888888",
		"peekViewTitleLabel.foreground": "#F5A623",

		// ── Merge Conflicts ─────────────────────────────────────
		"merge.currentHeaderBackground": "#2A5A2A50",
		"merge.currentContentBackground": "#2A5A2A20",
		"merge.incomingHeaderBackground": "#5A4A0A50",
		"merge.incomingContentBackground": "#5A4A0A20",
		"merge.border": "#2A2A2A",

		// ── Terminal ────────────────────────────────────────────
		"terminal.background": "#0D0D0D",
		"terminal.foreground": "#E8E8E8",
		"terminal.border": "#1E1E1E",
		"terminal.selectionBackground": "#F5A62326",
		"terminal.tab.activeBorder": "#F5A623",
		"terminalCursor.background": "#0D0D0D",
		"terminalCursor.foreground": "#F5A623",
		"terminal.ansiBlack": "#0D0D0D",
		"terminal.ansiBrightBlack": "#555555",
		"terminal.ansiRed": "#F85149",
		"terminal.ansiBrightRed": "#FF7B72",
		"terminal.ansiGreen": "#4EC964",
		"terminal.ansiBrightGreen": "#7EE787",
		"terminal.ansiYellow": "#F5A623",
		"terminal.ansiBrightYellow": "#F0D399",
		"terminal.ansiBlue": "#6CB4EE",
		"terminal.ansiBrightBlue": "#A5D6FF",
		"terminal.ansiMagenta": "#BC8CFF",
		"terminal.ansiBrightMagenta": "#D2A8FF",
		"terminal.ansiCyan": "#76D9E6",
		"terminal.ansiBrightCyan": "#A5F3FC",
		"terminal.ansiWhite": "#E8E8E8",
		"terminal.ansiBrightWhite": "#FFFFFF",

		// ── Breadcrumbs ─────────────────────────────────────────
		"breadcrumb.foreground": "#888888",
		"breadcrumb.focusForeground": "#E8E8E8",
		"breadcrumb.activeSelectionForeground": "#F5A623",
		"breadcrumbPicker.background": "#161616",

		// ── Minimap ─────────────────────────────────────────────
		"minimap.findMatchHighlight": "#F5A62360",
		"minimap.selectionHighlight": "#F5A62330",
		"minimap.errorHighlight": "#F85149",
		"minimap.warningHighlight": "#D4A017",
		"minimap.background": "#0D0D0D",
		"minimapSlider.background": "#55555520",
		"minimapSlider.hoverBackground": "#55555540",
		"minimapSlider.activeBackground": "#55555560",
		"minimapGutter.addedBackground": "#4EC964",
		"minimapGutter.deletedBackground": "#F85149",
		"minimapGutter.modifiedBackground": "#B8860B",

		// ── Git Decorations ─────────────────────────────────────
		"gitDecoration.addedResourceForeground": "#4EC964",
		"gitDecoration.conflictingResourceForeground": "#D4A017",
		"gitDecoration.deletedResourceForeground": "#F85149",
		"gitDecoration.ignoredResourceForeground": "#555555",
		"gitDecoration.modifiedResourceForeground": "#B8860B",
		"gitDecoration.renamedResourceForeground": "#76D9E6",
		"gitDecoration.stageDeletedResourceForeground": "#F85149",
		"gitDecoration.stageModifiedResourceForeground": "#B8860B",
		"gitDecoration.submoduleResourceForeground": "#888888",
		"gitDecoration.untrackedResourceForeground": "#4EC964",

		// ── Debug ───────────────────────────────────────────────
		"debugToolBar.background": "#161616",
		"debugToolBar.border": "#2A2A2A",
		"debugIcon.breakpointForeground": "#F5A623",
		"debugIcon.breakpointDisabledForeground": "#555555",
		"debugIcon.breakpointUnverifiedForeground": "#B8860B",
		"debugIcon.startForeground": "#4EC964",
		"debugIcon.pauseForeground": "#F5A623",
		"debugIcon.stopForeground": "#F85149",
		"debugIcon.continueForeground": "#F5A623",
		"debugIcon.stepOverForeground": "#F5A623",
		"debugIcon.stepIntoForeground": "#F5A623",
		"debugIcon.stepOutForeground": "#F5A623",
		"debugIcon.restartForeground": "#4EC964",
		"debugIcon.disconnectForeground": "#F85149",

		// ── Extensions ──────────────────────────────────────────
		"extensionButton.prominentBackground": "#F5A623",
		"extensionButton.prominentForeground": "#0D0D0D",
		"extensionButton.prominentHoverBackground": "#D4901E",
		"extensionBadge.remoteBackground": "#B8860B",
		"extensionBadge.remoteForeground": "#0D0D0D",

		// ── Settings ────────────────────────────────────────────
		"settings.headerForeground": "#E8E8E8",
		"settings.modifiedItemIndicator": "#F5A623",
		"settings.dropdownBackground": "#141414",
		"settings.dropdownBorder": "#2A2A2A",
		"settings.checkboxBackground": "#141414",
		"settings.checkboxBorder": "#2A2A2A",
		"settings.textInputBackground": "#141414",
		"settings.textInputBorder": "#2A2A2A",
		"settings.numberInputBackground": "#141414",
		"settings.numberInputBorder": "#2A2A2A",
		"settings.focusedRowBackground": "#1A1A1A",
		"settings.focusedRowBorder": "#F5A62340",

		// ── Welcome Page ────────────────────────────────────────
		"welcomePage.tileBackground": "#161616",
		"welcomePage.tileBorder": "#2A2A2A",
		"welcomePage.tileHoverBackground": "#1A1A1A",
		"welcomePage.progress.foreground": "#F5A623",
		"walkThrough.embeddedEditorBackground": "#0D0D0D",

		// ── Text ────────────────────────────────────────────────
		"textBlockQuote.background": "#161616",
		"textBlockQuote.border": "#B8860B",
		"textCodeBlock.background": "#161616",
		"textLink.activeForeground": "#F5A623",
		"textLink.foreground": "#C8962A",
		"textPreformat.foreground": "#E8E8E8",
		"textPreformat.background": "#1A1A1A",
		"textSeparator.foreground": "#1E1E1E",

		// ── Chat ────────────────────────────────────────────────
		"chat.slashCommandBackground": "#B8860B40",
		"chat.slashCommandForeground": "#F5A623",
		"chat.editedFileForeground": "#C8962A",

		// ── Global ──────────────────────────────────────────────
		"focusBorder": "#F5A623",
		"foreground": "#E8E8E8",
		"descriptionForeground": "#888888",
		"errorForeground": "#F85149",
		"icon.foreground": "#888888",
		"selection.background": "#F5A62340",
		"widget.border": "#2A2A2A",
		"widget.shadow": "#00000060",
		"sash.hoverBorder": "#F5A623",
		"keybindingLabel.foreground": "#E8E8E8",
		"keybindingLabel.background": "#1A1A1A",
		"keybindingLabel.border": "#2A2A2A",
		"keybindingLabel.bottomBorder": "#1E1E1E",

		// ── Menu ────────────────────────────────────────────────
		"menu.background": "#111111",
		"menu.foreground": "#E8E8E8",
		"menu.selectionBackground": "#1A1A1A",
		"menu.selectionForeground": "#F5A623",
		"menu.separatorBackground": "#2A2A2A",
		"menu.border": "#2A2A2A",
		"menubar.selectionBackground": "#1A1A1A",
		"menubar.selectionForeground": "#F5A623"
	},

	// ── Token Colors (Syntax Highlighting) ──────────────────────
	"tokenColors": [
		{
			"name": "Comments",
			"scope": ["comment", "punctuation.definition.comment"],
			"settings": {
				"foreground": "#555555",
				"fontStyle": "italic"
			}
		},
		{
			"name": "Strings",
			"scope": ["string", "string.quoted", "string.template"],
			"settings": {
				"foreground": "#C8962A"
			}
		},
		{
			"name": "String escape characters",
			"scope": ["constant.character.escape"],
			"settings": {
				"foreground": "#F5A623"
			}
		},
		{
			"name": "Numbers and constants",
			"scope": ["constant.numeric", "constant.language", "constant.character"],
			"settings": {
				"foreground": "#D4A44C"
			}
		},
		{
			"name": "Boolean constants",
			"scope": ["constant.language.boolean"],
			"settings": {
				"foreground": "#F5A623"
			}
		},
		{
			"name": "Keywords",
			"scope": ["keyword", "storage.type", "storage.modifier"],
			"settings": {
				"foreground": "#BC8CFF"
			}
		},
		{
			"name": "Control flow",
			"scope": [
				"keyword.control",
				"keyword.operator.new",
				"keyword.operator.delete",
				"keyword.other.using",
				"keyword.other.operator"
			],
			"settings": {
				"foreground": "#BC8CFF"
			}
		},
		{
			"name": "Operators",
			"scope": ["keyword.operator"],
			"settings": {
				"foreground": "#E8E8E8"
			}
		},
		{
			"name": "Functions",
			"scope": [
				"entity.name.function",
				"support.function",
				"meta.function-call"
			],
			"settings": {
				"foreground": "#F0D399"
			}
		},
		{
			"name": "Function parameters",
			"scope": ["variable.parameter"],
			"settings": {
				"foreground": "#E8C273"
			}
		},
		{
			"name": "Types and classes",
			"scope": [
				"entity.name.type",
				"entity.name.class",
				"entity.name.namespace",
				"support.class",
				"support.type",
				"entity.other.inherited-class"
			],
			"settings": {
				"foreground": "#76D9E6"
			}
		},
		{
			"name": "Interfaces",
			"scope": ["entity.name.type.interface"],
			"settings": {
				"foreground": "#A5F3FC"
			}
		},
		{
			"name": "Variables",
			"scope": [
				"variable",
				"meta.definition.variable.name",
				"support.variable",
				"entity.name.variable"
			],
			"settings": {
				"foreground": "#E8E8E8"
			}
		},
		{
			"name": "Constants and enum members",
			"scope": ["variable.other.constant", "variable.other.enummember"],
			"settings": {
				"foreground": "#D4A44C"
			}
		},
		{
			"name": "Object keys / properties",
			"scope": [
				"meta.object-literal.key",
				"variable.other.property",
				"support.type.property-name"
			],
			"settings": {
				"foreground": "#E8C273"
			}
		},
		{
			"name": "Tags (HTML/JSX)",
			"scope": ["entity.name.tag", "support.class.component"],
			"settings": {
				"foreground": "#F5A623"
			}
		},
		{
			"name": "Tag attributes",
			"scope": ["entity.other.attribute-name"],
			"settings": {
				"foreground": "#C8962A"
			}
		},
		{
			"name": "Decorators / annotations",
			"scope": [
				"meta.decorator",
				"meta.decorator entity.name",
				"storage.type.annotation"
			],
			"settings": {
				"foreground": "#F5A623",
				"fontStyle": "italic"
			}
		},
		{
			"name": "Punctuation — braces, brackets, semicolons",
			"scope": [
				"punctuation.definition.block",
				"punctuation.definition.parameters",
				"punctuation.separator",
				"punctuation.terminator"
			],
			"settings": {
				"foreground": "#888888"
			}
		},
		{
			"name": "Regex",
			"scope": ["string.regexp"],
			"settings": {
				"foreground": "#D4A44C"
			}
		},
		{
			"name": "Regex groups",
			"scope": [
				"punctuation.definition.group.regexp",
				"support.other.parenthesis.regexp"
			],
			"settings": {
				"foreground": "#C8962A"
			}
		},
		{
			"name": "Markdown headings",
			"scope": ["heading.1.markdown", "heading.2.markdown", "heading.3.markdown"],
			"settings": {
				"foreground": "#F5A623",
				"fontStyle": "bold"
			}
		},
		{
			"name": "Markdown links",
			"scope": ["string.other.link.title.markdown", "string.other.link.description.markdown"],
			"settings": {
				"foreground": "#C8962A"
			}
		},
		{
			"name": "Markdown bold",
			"scope": ["markup.bold"],
			"settings": {
				"foreground": "#E8E8E8",
				"fontStyle": "bold"
			}
		},
		{
			"name": "Markdown italic",
			"scope": ["markup.italic"],
			"settings": {
				"foreground": "#E8E8E8",
				"fontStyle": "italic"
			}
		},
		{
			"name": "Markdown code",
			"scope": ["markup.inline.raw.string.markdown", "markup.fenced_code.block"],
			"settings": {
				"foreground": "#C8962A"
			}
		},
		{
			"name": "CSS property names",
			"scope": ["support.type.property-name.css"],
			"settings": {
				"foreground": "#E8C273"
			}
		},
		{
			"name": "CSS property values",
			"scope": [
				"support.constant.property-value",
				"support.constant.font-name",
				"support.constant.color"
			],
			"settings": {
				"foreground": "#C8962A"
			}
		},
		{
			"name": "CSS selectors",
			"scope": ["entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css"],
			"settings": {
				"foreground": "#F5A623"
			}
		},
		{
			"name": "JSON keys",
			"scope": ["support.type.property-name.json"],
			"settings": {
				"foreground": "#E8C273"
			}
		},
		{
			"name": "YAML keys",
			"scope": ["entity.name.tag.yaml"],
			"settings": {
				"foreground": "#E8C273"
			}
		},
		{
			"name": "Shell variables",
			"scope": ["variable.other.normal.shell", "variable.other.special.shell"],
			"settings": {
				"foreground": "#F5A623"
			}
		},
		{
			"name": "Diff inserted",
			"scope": ["markup.inserted"],
			"settings": {
				"foreground": "#4EC964"
			}
		},
		{
			"name": "Diff deleted",
			"scope": ["markup.deleted"],
			"settings": {
				"foreground": "#F85149"
			}
		},
		{
			"name": "Diff changed",
			"scope": ["markup.changed"],
			"settings": {
				"foreground": "#D4A017"
			}
		},
		{
			"name": "Labels",
			"scope": ["entity.name.label"],
			"settings": {
				"foreground": "#888888"
			}
		}
	],

	// ── Semantic Token Colors ───────────────────────────────────
	"semanticTokenColors": {
		"newOperator": "#BC8CFF",
		"stringLiteral": "#C8962A",
		"customLiteral": "#F0D399",
		"numberLiteral": "#D4A44C",
		"type": "#76D9E6",
		"interface": "#A5F3FC",
		"enum": "#76D9E6",
		"enumMember": "#D4A44C",
		"function": "#F0D399",
		"method": "#F0D399",
		"property": "#E8C273",
		"variable": "#E8E8E8",
		"parameter": "#E8C273",
		"namespace": "#76D9E6",
		"decorator": "#F5A623"
	},

	"semanticHighlighting": true
}
```

### 2.3 Eliminating VS Code Blue — Systematic Approach

VS Code blue (`#007ACC` and variants) appears in these workbench color keys. Every one is overridden in the theme:

| VS Code key | VS Code default | Son of Anton value |
|---|---|---|
| `activityBar.activeBorder` | `#007ACC` | `#F5A623` |
| `activityBarBadge.background` | `#007ACC` | `#F5A623` |
| `button.background` | `#0078D4` | `#F5A623` |
| `button.hoverBackground` | `#026EC1` | `#D4901E` |
| `editorGutter.modifiedBackground` | `#0078D4` | `#B8860B` |
| `focusBorder` | `#007ACC` | `#F5A623` |
| `inputOption.activeBackground` | `#2489DB82` | `#F5A62330` |
| `inputOption.activeBorder` | `#2488DB` | `#F5A623` |
| `menu.selectionBackground` | `#0078D4` | `#1A1A1A` |
| `panelTitle.activeBorder` | `#007ACC` | `#F5A623` |
| `progressBar.background` | `#0078D4` | `#F5A623` |
| `statusBar.debuggingBackground` | `#0078D4` | `#5A4A0A` |
| `statusBar.focusBorder` | `#0078D4` | `#F5A623` |
| `statusBarItem.focusBorder` | `#0078D4` | `#F5A623` |
| `statusBarItem.remoteBackground` | `#0078D4` | `#B8860B` |
| `tab.activeBorderTop` | `#0078D4` | `#F5A623` |
| `terminal.tab.activeBorder` | `#0078D4` | `#F5A623` |
| `textLink.foreground` | `#4daafc` | `#C8962A` |
| `textLink.activeForeground` | `#4daafc` | `#F5A623` |
| `welcomePage.progress.foreground` | `#0078D4` | `#F5A623` |

### 2.4 High-Contrast Variant

File: `extensions/son-of-anton/themes/son-of-anton-hc.json`

The high-contrast variant replaces all gold with white for maximum legibility while retaining the dark background. Structural gold (`#B8860B`) becomes `#FFFFFF` and interactive gold (`#F5A623`) becomes `#FFD700` (a higher-contrast warm tone that remains distinguishable from pure white).

Key overrides from the base theme:

```jsonc
{
	"$schema": "vscode://schemas/color-theme",
	"name": "Son of Anton High Contrast",
	"type": "hc-black",
	"include": "./son-of-anton-dark.json",
	"colors": {
		"editor.background": "#000000",
		"editor.foreground": "#FFFFFF",
		"editorCursor.foreground": "#FFD700",
		"editorLineNumber.foreground": "#FFFFFF",
		"editorLineNumber.activeForeground": "#FFD700",
		"editorBracketMatch.border": "#FFD700",
		"focusBorder": "#FFD700",
		"activityBar.activeBorder": "#FFD700",
		"activityBar.foreground": "#FFD700",
		"activityBar.inactiveForeground": "#FFFFFF",
		"activityBarBadge.background": "#FFD700",
		"tab.activeBorderTop": "#FFD700",
		"tab.activeForeground": "#FFFFFF",
		"button.background": "#FFD700",
		"button.foreground": "#000000",
		"list.activeSelectionForeground": "#FFD700",
		"list.focusOutline": "#FFD700",
		"list.highlightForeground": "#FFD700",
		"progressBar.background": "#FFD700",
		"panelTitle.activeBorder": "#FFD700",
		"statusBarItem.remoteBackground": "#FFD700",
		"textLink.foreground": "#FFD700",
		"textLink.activeForeground": "#FFD700",
		"sideBarTitle.foreground": "#FFFFFF",
		"selection.background": "#FFD70060",
		"editor.selectionBackground": "#FFD70040",
		"terminal.selectionBackground": "#FFD70040",
		"contrastBorder": "#FFD700",
		"contrastActiveBorder": "#FFD700"
	}
}
```

---

## 3. Typography

### 3.1 Font Family Specification

| Context | Font family | Weights | Tracking |
|---|---|---|---|
| UI (menus, labels, sidebar, tabs) | Geist | 400 body, 500 labels/tabs, 600 headings | +0.01em labels, +0.05em wordmark |
| Editor | Geist Mono | 400 | default |
| Terminal | Geist Mono | 400 | default |
| Mission Control cards | Geist | 400, 500, 600 | +0.01em |
| Spec document prose | Geist | 400, 600 | default |
| Spec document code | Geist Mono | 400 | default |

### 3.2 Fallback Chain

```
UI:     'Geist', 'Inter', system-ui, -apple-system, sans-serif
Editor: 'Geist Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace
```

### 3.3 Font Files and Bundling

Font files are bundled at: `resources/fonts/geist/`

```
resources/fonts/geist/
  GeistVariableVF.woff2          (variable font, all weights)
  GeistMonoVariableVF.woff2      (variable font, all weights)
  LICENSE                         (SIL Open Font License 1.1)
```

Variable fonts are preferred over static weight files to reduce bundle size. A single `GeistVariableVF.woff2` file covers weights 100-900.

### 3.4 Font Loading in Electron

Font loading is handled in two layers:

**Layer 1 — CSS @font-face declarations** in the shared stylesheet (`src/vs/sessions/contrib/theme/browser/fonts.css`):

```css
@font-face {
	font-family: 'Geist';
	src: url('../../../../../resources/fonts/geist/GeistVariableVF.woff2') format('woff2');
	font-weight: 100 900;
	font-style: normal;
	font-display: swap;
}

@font-face {
	font-family: 'Geist Mono';
	src: url('../../../../../resources/fonts/geist/GeistMonoVariableVF.woff2') format('woff2');
	font-weight: 100 900;
	font-style: normal;
	font-display: swap;
}
```

**Layer 2 — VS Code settings defaults** in the extension's `package.json`:

```jsonc
{
	"contributes": {
		"configurationDefaults": {
			"editor.fontFamily": "'Geist Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
			"editor.fontLigatures": false,
			"editor.fontSize": 13,
			"editor.lineHeight": 1.6,
			"terminal.integrated.fontFamily": "'Geist Mono'",
			"window.titleBarStyle": "custom"
		}
	}
}
```

**Layer 3 — Webview injection** for Mission Control, DAG Explorer, and other custom surfaces. Each webview HTML template must include the font-face declarations directly since webviews cannot access the host page's stylesheets. A shared helper function provides this:

File: `src/vs/sessions/contrib/theme/browser/fontLoader.ts`

```typescript
export function getGeistFontFaces(resourceRoot: string): string {
	return `
		@font-face {
			font-family: 'Geist';
			src: url('${resourceRoot}/fonts/geist/GeistVariableVF.woff2') format('woff2');
			font-weight: 100 900;
			font-style: normal;
			font-display: swap;
		}
		@font-face {
			font-family: 'Geist Mono';
			src: url('${resourceRoot}/fonts/geist/GeistMonoVariableVF.woff2') format('woff2');
			font-weight: 100 900;
			font-style: normal;
			font-display: swap;
		}
	`;
}
```

### 3.5 Surface-Specific Typography

| Surface | Font | Size | Weight | Rationale |
|---|---|---|---|---|
| Mission Control task cards | Geist | 13px | 400 body, 500 labels, 600 titles | Proportional signals non-editor surface |
| Mission Control metadata | Geist | 11px | 400 | De-emphasised secondary info |
| DAG Explorer node labels | Geist | 12px | 500 | Readable at zoom levels |
| DAG Explorer detail panel | Geist | 13px | 400 | Standard reading size |
| Spec document headings | Geist | 16px | 600 | Hierarchical emphasis |
| Spec document body | Geist | 14px | 400 | Comfortable reading |
| Spec document code blocks | Geist Mono | 13px | 400 | Code distinction |
| EARS clause keywords | Geist Mono | 13px | 600 | Structural emphasis |
| Terminal command/output | Geist Mono | 13px | 400 | Standard terminal |
| Terminal block metadata | Geist | 11px | 400 | Proportional for labels |

---

## 4. Icon Set

### 4.1 Activity Bar Icons

Seven custom icons for the Son of Anton activity bar, replacing VS Code's default Explorer/Search/SCM/Extensions. All icons follow a consistent 24x24 viewBox, 1.5px stroke weight, no fill (outline only).

File location: `resources/icons/son-of-anton/`

| # | Surface | File | Icon concept | Active color | Inactive color |
|---|---|---|---|---|---|
| 1 | Agent Tasks | `agent-tasks.svg` | Three branching nodes connected by directed edges | `#F5A623` | `#B8860B` |
| 2 | Explorer | `explorer.svg` | Folder tree (retained for familiarity) | `#F5A623` | `#B8860B` |
| 3 | DAG Explorer | `dag-explorer.svg` | Directed acyclic graph — 5 nodes in diamond arrangement with arrows | `#F5A623` | `#B8860B` |
| 4 | Memory Browser | `memory-browser.svg` | Three stacked cylinders (vector/graph/keyword) | `#F5A623` | `#B8860B` |
| 5 | Spec Documents | `spec-documents.svg` | Document with three horizontal lines and a checkbox | `#F5A623` | `#B8860B` |
| 6 | MCP Connections | `mcp-connections.svg` | Plug/socket with radiating connection lines | `#F5A623` | `#B8860B` |
| 7 | Search | `search.svg` | Magnifier (retained for familiarity) | `#F5A623` | `#B8860B` |

### 4.2 SVG Template

All activity bar icons follow this template:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
     stroke-linejoin="round">
  <!-- icon paths here -->
</svg>
```

Icons use `currentColor` for stroke so that VS Code's theme system controls the color through `activityBar.foreground` and `activityBar.inactiveForeground`.

### 4.3 Example SVG: Agent Tasks

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
     stroke-linejoin="round">
  <!-- Root node -->
  <circle cx="12" cy="4" r="2.5"/>
  <!-- Left child -->
  <circle cx="5" cy="14" r="2.5"/>
  <!-- Right child -->
  <circle cx="19" cy="14" r="2.5"/>
  <!-- Center child -->
  <circle cx="12" cy="21" r="2"/>
  <!-- Edges -->
  <line x1="12" y1="6.5" x2="5" y2="11.5"/>
  <line x1="12" y1="6.5" x2="19" y2="11.5"/>
  <line x1="5" y1="16.5" x2="12" y2="19"/>
  <line x1="19" y1="16.5" x2="12" y2="19"/>
</svg>
```

### 4.4 Example SVG: DAG Explorer

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
     stroke-linejoin="round">
  <!-- Top node -->
  <rect x="9" y="1" width="6" height="4" rx="1"/>
  <!-- Middle left -->
  <rect x="2" y="10" width="6" height="4" rx="1"/>
  <!-- Middle right -->
  <rect x="16" y="10" width="6" height="4" rx="1"/>
  <!-- Bottom -->
  <rect x="9" y="19" width="6" height="4" rx="1"/>
  <!-- Directed edges -->
  <line x1="10" y1="5" x2="6" y2="10"/>
  <line x1="14" y1="5" x2="18" y2="10"/>
  <line x1="6" y1="14" x2="10" y2="19"/>
  <line x1="18" y1="14" x2="14" y2="19"/>
  <!-- Arrow heads (small) -->
  <polyline points="5,8.5 6,10 7.5,9"/>
  <polyline points="16.5,9 18,10 19,8.5"/>
  <polyline points="8.5,17.5 10,19 11,17.5"/>
  <polyline points="13,17.5 14,19 15.5,17.5"/>
</svg>
```

### 4.5 Node Type Icons for DAG Explorer

Used within the DAG Explorer canvas to distinguish node types. 16x16 viewBox, 1px stroke weight.

| Node type | File | Visual concept |
|---|---|---|
| Package/module | `node-package.svg` | Box with grid lines |
| File | `node-file.svg` | Document with folded corner |
| Function | `node-function.svg` | `f()` glyph |
| Class | `node-class.svg` | Diamond shape |
| Test | `node-test.svg` | Checkmark in circle |
| Config | `node-config.svg` | Gear |
| External dependency | `node-external.svg` | Cloud outline |

### 4.6 Agent Status Icons

Used in terminal blocks, Mission Control cards, and the status bar. 16x16 viewBox.

| Status | File | Visual concept | Color |
|---|---|---|---|
| Running | `agent-running.svg` | Pulsing circle with inner dot | `#F5A623` |
| Complete | `agent-complete.svg` | Checkmark in circle | `#4EC964` |
| Failed | `agent-failed.svg` | X in circle | `#F85149` |
| Waiting | `agent-waiting.svg` | Clock face | `#B8860B` |
| Paused | `agent-paused.svg` | Pause bars in circle | `#888888` |

### 4.7 Spec Document Icons

Used in the tab bar and explorer to distinguish spec document types. 16x16 viewBox.

| Spec type | File | Visual concept | Color |
|---|---|---|---|
| Requirements | `spec-requirements.svg` | Clipboard with WHEN/SHALL structure | `#F5A623` |
| Design | `spec-design.svg` | Blueprint with components | `#C8962A` |
| Tasks | `spec-tasks.svg` | Checklist with progress bar | `#B8860B` |

### 4.8 Codicon Integration

Son of Anton extends the Codicon icon font rather than replacing it. Custom icons are registered through the VS Code icon contribution point:

```jsonc
{
	"contributes": {
		"icons": {
			"soa-agent-tasks": {
				"description": "Agent Tasks icon",
				"default": { "fontPath": "../../resources/icons/son-of-anton/agent-tasks.svg" }
			},
			"soa-dag-explorer": {
				"description": "DAG Explorer icon",
				"default": { "fontPath": "../../resources/icons/son-of-anton/dag-explorer.svg" }
			},
			"soa-memory-browser": {
				"description": "Memory Browser icon",
				"default": { "fontPath": "../../resources/icons/son-of-anton/memory-browser.svg" }
			},
			"soa-spec-documents": {
				"description": "Spec Documents icon",
				"default": { "fontPath": "../../resources/icons/son-of-anton/spec-documents.svg" }
			},
			"soa-mcp-connections": {
				"description": "MCP Connections icon",
				"default": { "fontPath": "../../resources/icons/son-of-anton/mcp-connections.svg" }
			}
		}
	}
}
```

---

## 5. Tab Bar Treatment

### 5.1 Tab States

| State | Background | Bottom border | Text color | Additional |
|---|---|---|---|---|
| Active | `#1A1A1A` | `#F5A623` 2px | `#E8E8E8` | — |
| Inactive | `#0D0D0D` | `#2A2A2A` 1px | `#888888` | — |
| Hover (inactive) | `#161616` | `#F5A62380` 1px | `#E8E8E8` | — |
| Unfocused active | `#161616` | `#B8860B` 2px | `#888888` | — |
| Agent-modified | `#1A1A1A` | `#F5A623` 2px | `#E8E8E8` | Amber left-edge shimmer |
| Spec document | `#1A1A1A` | `#F5A623` 2px | `#E8E8E8` | Amber document icon prefix |
| Pinned divider | — | — | — | `#B8860B` right border |

### 5.2 Tab Shape

- Slight bottom-corner radius: `border-radius: 0 0 4px 4px`
- This softens the tab without going fully pill-shaped
- VS Code's rectangular tabs are an immediate visual signature; the radius breaks that

### 5.3 Agent-Modified Shimmer

When an agent writes to a file, the corresponding tab receives a brief amber shimmer on its left edge. This is a CSS animation that plays once on state change:

```css
@keyframes soa-agent-shimmer {
	0% {
		box-shadow: inset 2px 0 0 0 transparent;
	}
	15% {
		box-shadow: inset 2px 0 8px 0 #F5A62380;
	}
	100% {
		box-shadow: inset 2px 0 0 0 #F5A62340;
	}
}

.tab.agent-modified {
	animation: soa-agent-shimmer 1.2s ease-out forwards;
}
```

After the animation completes, the tab retains a subtle amber left inset shadow (`#F5A62340`) until the file is reviewed.

### 5.4 Spec Document Tab Prefix

Tabs for `requirements.md`, `design.md`, and `tasks.md` (matched by filename convention) display a small amber document icon (`--soa-gold-primary`) to the left of the filename. This uses the `soa-spec-*` icons from the icon contribution.

### 5.5 Tab Overflow

Tabs overflow into a horizontally scrollable strip, never a dropdown. Dropdowns break the spatial model of open files. The scroll behaviour uses smooth scrolling with momentum.

---

## 6. Cursor and Editor Chrome

### 6.1 Cursor

- Cursor color: `#F5A623` (matches `editorCursor.foreground`)
- Cursor style: Line (default), configurable by user
- Cursor blinking: Smooth (default)
- Cursor width: 2px

### 6.2 Current Line Highlight

Rather than a full-line background tint (which creates visual noise), Son of Anton uses a thin amber left-border glow:

- Line highlight background: `#1A1A1A40` (very subtle, 25% opacity)
- Line highlight border: `#F5A62320` (amber at 12.5% opacity)

The effect is a gentle amber warmth on the active line that draws the eye without competing with syntax highlighting.

In practice this is achieved through the VS Code theme keys:

```jsonc
"editor.lineHighlightBackground": "#1A1A1A40",
"editor.lineHighlightBorder": "#F5A62320"
```

To achieve a true left-gutter glow effect (beyond what theme keys offer), a CSS override in the sessions theme layer can add:

```css
.current-line {
	border-left: 2px solid #F5A62340;
	margin-left: -2px;
}
```

### 6.3 Line Numbers

- Inactive line numbers: `#B8860B` (muted gold — structural, not accent)
- Active line number: `#F5A623` (bright gold)
- This is a deliberate departure from VS Code's grey line numbers. Gold line numbers make the gutter feel like part of the product's identity rather than generic chrome.

### 6.4 Selection

- Selection background: `#F5A62326` (amber at 15% opacity)
- Selection highlight (other occurrences): `#F5A62315` (amber at 8% opacity)
- The amber selection is warm and distinctive. It never competes with syntax highlighting because the opacity is low.

### 6.5 Find Match

- Current match: `#F5A62340` (amber at 25% opacity)
- Other matches: `#F5A62320` (amber at 12.5% opacity)
- Overview ruler indicator: `#F5A62380`

### 6.6 Bracket Matching

- Background: `#F5A62320`
- Border: `#F5A623` (solid amber border around matched brackets)
- Bracket pair colorisation uses a gold gradient: `#F5A623` → `#C8962A` → `#B8860B` → `#D4A44C` → `#E8C273` → `#F5A623`

### 6.7 Indent Guides

- Inactive: `#1E1E1E` (barely visible — the guide is there for alignment, not decoration)
- Active (containing the cursor): `#3A3A3A`

---

## 7. Implementation Plan

### 7.1 File Locations

| File | Purpose |
|---|---|
| `extensions/son-of-anton/themes/son-of-anton-dark.json` | Primary VS Code theme (workbench colors + token colors) |
| `extensions/son-of-anton/themes/son-of-anton-hc.json` | High-contrast variant |
| `extensions/son-of-anton/package.json` | Theme contribution point, configuration defaults |
| `src/vs/sessions/contrib/theme/browser/colorTokens.css` | CSS custom properties for webview surfaces |
| `src/vs/sessions/contrib/theme/browser/fonts.css` | @font-face declarations |
| `src/vs/sessions/contrib/theme/browser/fontLoader.ts` | Webview font injection helper |
| `src/vs/sessions/contrib/theme/browser/sonOfAntonTheme.ts` | Theme registration and activation |
| `src/vs/sessions/contrib/theme/browser/iconRegistry.ts` | Custom icon registration |
| `resources/fonts/geist/GeistVariableVF.woff2` | Geist UI font (variable) |
| `resources/fonts/geist/GeistMonoVariableVF.woff2` | Geist Mono editor font (variable) |
| `resources/fonts/geist/LICENSE` | SIL Open Font License |
| `resources/icons/son-of-anton/*.svg` | All custom SVG icons |

### 7.2 Build Steps

1. **Download fonts**: Fetch Geist and Geist Mono variable font files from the Vercel GitHub repository. Place in `resources/fonts/geist/`. Include the SIL license file.

2. **Create theme JSON**: Write `son-of-anton-dark.json` using the full workbench colors and token colors defined in section 2.2.

3. **Create HC theme**: Write `son-of-anton-hc.json` as defined in section 2.4.

4. **Update extension package.json**: Add `contributes.themes`, `contributes.icons`, and `contributes.configurationDefaults` entries.

5. **Create CSS custom properties**: Write `colorTokens.css` for use by webview surfaces (Mission Control, DAG Explorer, etc.).

6. **Create font CSS**: Write `fonts.css` with @font-face declarations.

7. **Create font loader**: Write `fontLoader.ts` for webview font injection.

8. **Create SVG icons**: Design and export all activity bar, node type, agent status, and spec document icons.

9. **Register theme activation**: In `sonOfAntonTheme.ts`, register the theme as the default when Son of Anton is the active product.

10. **Audit for blue**: Run a grep across all source for `#007ACC`, `#0078D4`, `#4daafc`, `#026EC1`, `#264F78`, `#1E9BE0` and ensure none appear in rendered output. This should be added as a CI check.

### 7.3 Modification Tier Classification

| Change | Tier | Rationale |
|---|---|---|
| Theme JSON files | 1 | New files in extension |
| CSS custom properties | 1 | New file in sessions contrib |
| Font files | 1 | New files in resources |
| SVG icons | 1 | New files in resources |
| Font loader utility | 1 | New file in sessions contrib |
| Extension package.json changes | 2 | Modifying existing extension manifest |
| Icon registry integration | 1 | New file in sessions contrib |

### 7.4 Validation Checklist

Before the visual identity is considered complete:

- [ ] No `#007ACC` or any VS Code blue variant appears in any rendered surface
- [ ] Geist loads correctly in the main window, terminal, and all webviews
- [ ] Geist Mono is the default editor and terminal font
- [ ] Activity bar uses all 7 custom icons with correct active/inactive gold states
- [ ] Tab bar shows amber bottom border on active tab
- [ ] Line numbers render in muted gold (`#B8860B`)
- [ ] Cursor is amber (`#F5A623`)
- [ ] Selection uses amber at 15% opacity
- [ ] Bracket matching shows amber border
- [ ] Focus ring uses amber (`#F5A623`) instead of blue
- [ ] Buttons use amber background with dark text
- [ ] Links use gold (`#C8962A`) instead of blue
- [ ] Status bar remote indicator uses gold, not blue
- [ ] High-contrast variant passes WCAG AAA for text contrast
- [ ] All custom surfaces (Mission Control, DAG Explorer) use the shared CSS custom properties
- [ ] Font license (SIL OFL) is included in the distribution

---

## Appendix A: Color Palette Visual Reference

```
Backgrounds (darkest → lightest):
#0A0A0A ████  canvas, title bar
#0D0D0D ████  editor, primary surfaces
#111111 ████  Mission Control, sidebar, panels
#141414 ████  inputs
#161616 ████  cards, elevated surfaces
#1A1A1A ████  hover, active tabs
#1C1C1C ████  widgets

Borders:
#1E1E1E ████  subtle
#2A2A2A ████  default
#3A3A3A ████  strong

Gold system:
#B8860B ████  secondary (structural, inactive)
#C8962A ████  dim (syntax, EARS keywords)
#D4901E ████  button hover
#F5A623 ████  primary (interactive, active)

Text:
#555555 ████  muted
#888888 ████  secondary
#E8E8E8 ████  primary

Status:
#2A5A2A ████  success bg    #4EC964 ████  success fg
#5A2A2A ████  error bg      #F85149 ████  error fg
#5A4A0A ████  warning bg    #D4A017 ████  warning fg
#1A3A5A ████  info bg       #6CB4EE ████  info fg

Syntax (warm palette):
#BC8CFF ████  keywords, control flow
#76D9E6 ████  types, classes
#F0D399 ████  functions
#E8C273 ████  properties, parameters
#C8962A ████  strings
#D4A44C ████  numbers, constants
```

## Appendix B: Syntax Highlighting Philosophy

Son of Anton's syntax highlighting uses a warm palette that complements the amber/gold chrome without competing with it. The guiding principle: gold is for the IDE chrome, warm earth tones are for code structure.

- **Keywords/control flow** use lilac (`#BC8CFF`) — the only cool colour, deliberately chosen to make control structure pop against the warm background
- **Types/classes** use teal (`#76D9E6`) — a second cool accent for structural type information
- **Functions** use warm cream (`#F0D399`) — close to gold but lighter, connecting code to the IDE's identity
- **Strings** use dim gold (`#C8962A`) — part of the gold family
- **Properties/parameters** use warm gold (`#E8C273`) — also part of the gold family
- **Comments** use muted grey (`#555555`) — deliberately subdued
- **Variables** use primary text (`#E8E8E8`) — neutral, letting structure and calls stand out

The result is a syntax palette where structural elements (keywords, types, functions) have distinct hues, while values and data (strings, numbers, properties) sit within the gold spectrum. This makes the warm aesthetic feel intentional rather than monochromatic.
