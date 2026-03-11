/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorUtils.js';

// --- Background tokens ---

export const SOA_BACKGROUND_PRIMARY = registerColor(
	'soa.background.primary',
	{ dark: '#0D0D0D', light: '#FFFFFF', hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('soa.background.primary', "Son of Anton primary background color used as the main editor surface.")
);

export const SOA_BACKGROUND_SECONDARY = registerColor(
	'soa.background.secondary',
	{ dark: '#111111', light: '#F8F8F8', hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('soa.background.secondary', "Son of Anton secondary background color used for side panels and auxiliary surfaces.")
);

export const SOA_BACKGROUND_ELEVATED = registerColor(
	'soa.background.elevated',
	{ dark: '#161616', light: '#F0F0F0', hcDark: '#0A0A0A', hcLight: '#FFFFFF' },
	localize('soa.background.elevated', "Son of Anton elevated background color used for dropdowns, popovers, and floating elements.")
);

export const SOA_BACKGROUND_HOVER = registerColor(
	'soa.background.hover',
	{ dark: '#1A1A1A', light: '#E8E8E8', hcDark: '#1A1A1A', hcLight: '#E0E0E0' },
	localize('soa.background.hover', "Son of Anton background color applied on hover to interactive elements.")
);

export const SOA_BACKGROUND_CANVAS = registerColor(
	'soa.background.canvas',
	{ dark: '#0A0A0A', light: '#FFFFFF', hcDark: '#000000', hcLight: '#FFFFFF' },
	localize('soa.background.canvas', "Son of Anton canvas background color used as the outermost container surface.")
);

// --- Border tokens ---

export const SOA_BORDER_DEFAULT = registerColor(
	'soa.border.default',
	{ dark: '#2A2A2A', light: '#D0D0D0', hcDark: '#6FC3DF', hcLight: '#0F4A85' },
	localize('soa.border.default', "Son of Anton default border color for separators and panel edges.")
);

export const SOA_BORDER_SUBTLE = registerColor(
	'soa.border.subtle',
	{ dark: '#1E1E1E', light: '#E0E0E0', hcDark: '#6FC3DF', hcLight: '#0F4A85' },
	localize('soa.border.subtle', "Son of Anton subtle border color for low-emphasis dividers.")
);

export const SOA_BORDER_FOCUS = registerColor(
	'soa.border.focus',
	{ dark: '#F5A623', light: '#D4920E', hcDark: '#F5A623', hcLight: '#D4920E' },
	localize('soa.border.focus', "Son of Anton focus border color applied to focused interactive elements.")
);

// --- Gold accent tokens ---

export const SOA_GOLD_PRIMARY = registerColor(
	'soa.gold.primary',
	{ dark: '#F5A623', light: '#D4920E', hcDark: '#F5A623', hcLight: '#B87D00' },
	localize('soa.gold.primary', "Son of Anton primary gold accent color used for branding and emphasis.")
);

export const SOA_GOLD_SECONDARY = registerColor(
	'soa.gold.secondary',
	{ dark: '#B8860B', light: '#9A7209', hcDark: '#D4A017', hcLight: '#7A5C00' },
	localize('soa.gold.secondary', "Son of Anton secondary gold accent color used for supporting highlights.")
);

export const SOA_GOLD_DIM = registerColor(
	'soa.gold.dim',
	{ dark: '#C8962A', light: '#A67B10', hcDark: '#C8962A', hcLight: '#8A6800' },
	localize('soa.gold.dim', "Son of Anton dimmed gold accent color used for inactive or de-emphasized accents.")
);

// --- Text tokens ---

export const SOA_TEXT_PRIMARY = registerColor(
	'soa.text.primary',
	{ dark: '#E8E8E8', light: '#1A1A1A', hcDark: '#FFFFFF', hcLight: '#000000' },
	localize('soa.text.primary', "Son of Anton primary text color for main content.")
);

export const SOA_TEXT_SECONDARY = registerColor(
	'soa.text.secondary',
	{ dark: '#888888', light: '#666666', hcDark: '#CCCCCC', hcLight: '#333333' },
	localize('soa.text.secondary', "Son of Anton secondary text color for labels and supporting text.")
);

export const SOA_TEXT_MUTED = registerColor(
	'soa.text.muted',
	{ dark: '#555555', light: '#999999', hcDark: '#AAAAAA', hcLight: '#555555' },
	localize('soa.text.muted', "Son of Anton muted text color for placeholders and disabled text.")
);

// --- Status tokens ---

export const SOA_STATUS_SUCCESS = registerColor(
	'soa.status.success',
	{ dark: '#2A5A2A', light: '#D4EDDA', hcDark: '#2A5A2A', hcLight: '#155724' },
	localize('soa.status.success', "Son of Anton success status color used for positive outcomes and confirmations.")
);

export const SOA_STATUS_ERROR = registerColor(
	'soa.status.error',
	{ dark: '#5A2A2A', light: '#F8D7DA', hcDark: '#5A2A2A', hcLight: '#721C24' },
	localize('soa.status.error', "Son of Anton error status color used for failures and critical issues.")
);

export const SOA_STATUS_WARNING = registerColor(
	'soa.status.warning',
	{ dark: '#5A4A0A', light: '#FFF3CD', hcDark: '#5A4A0A', hcLight: '#856404' },
	localize('soa.status.warning', "Son of Anton warning status color used for cautions and alerts.")
);

// --- Mission Control tokens ---

export const SOA_MISSION_CONTROL_QUEUED = registerColor(
	'soa.missionControl.queued',
	{ dark: '#808080', light: '#808080', hcDark: '#A0A0A0', hcLight: '#606060' },
	localize('soa.missionControl.queued', "Son of Anton Mission Control color for tasks in the queued state.")
);

export const SOA_MISSION_CONTROL_RUNNING = registerColor(
	'soa.missionControl.running',
	{ dark: '#F5A623', light: '#D4920E', hcDark: '#F5A623', hcLight: '#B87D00' },
	localize('soa.missionControl.running', "Son of Anton Mission Control color for tasks currently running.")
);

export const SOA_MISSION_CONTROL_REVIEW = registerColor(
	'soa.missionControl.review',
	{ dark: '#E67E22', light: '#C96A10', hcDark: '#E67E22', hcLight: '#A85500' },
	localize('soa.missionControl.review', "Son of Anton Mission Control color for tasks awaiting review.")
);

export const SOA_MISSION_CONTROL_COMPLETE = registerColor(
	'soa.missionControl.complete',
	{ dark: '#27AE60', light: '#1E8449', hcDark: '#2ECC71', hcLight: '#145A32' },
	localize('soa.missionControl.complete', "Son of Anton Mission Control color for completed tasks.")
);

export const SOA_MISSION_CONTROL_FAILED = registerColor(
	'soa.missionControl.failed',
	{ dark: '#E74C3C', light: '#C0392B', hcDark: '#FF6B6B', hcLight: '#922B21' },
	localize('soa.missionControl.failed', "Son of Anton Mission Control color for failed tasks.")
);
