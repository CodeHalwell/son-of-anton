/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Generate a cryptographic nonce for CSP script tags.
 */
function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * Returns the full HTML content for the Agent Chat webview panel.
 *
 * Security note: This webview runs in a sandboxed iframe with strict CSP.
 * All event data rendered via innerHTML is first passed through escapeHtml()
 * to prevent injection. The nonce restricts script execution to our own code.
 */
export function getAgentChatHtml(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
	const nonce = getNonce();
	const cspSource = webview.cspSource;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<title>Son of Anton Agent</title>
	<style nonce="${nonce}">
		/* ================================================================
		   Son of Anton Agent Chat — Gold Theme
		   ================================================================ */

		:root {
			--bg: #0D0D0D;
			--card-bg: #161616;
			--card-border: #2A2A2A;
			--amber: #F5A623;
			--muted-gold: #B8860B;
			--text-primary: #E8E8E8;
			--text-secondary: #888888;
			--success-bg: #2A5A2A;
			--error-bg: #5A2A2A;
			--reasoning-bg: #111111;
			--font-ui: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			--font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace;
		}

		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			background: var(--bg);
			color: var(--text-primary);
			font-family: var(--font-ui);
			font-size: 13px;
			line-height: 1.5;
			height: 100vh;
			overflow: hidden;
		}

		/* ---- Layout ---- */
		.agent-chat {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}

		/* ---- Run Info Header ---- */
		.run-header {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 8px 16px;
			background: var(--card-bg);
			border-bottom: 1px solid var(--card-border);
			flex-shrink: 0;
			min-height: 40px;
		}

		.run-header-agent {
			font-weight: 600;
			color: var(--amber);
		}

		.run-header-model {
			color: var(--text-secondary);
			font-size: 12px;
		}

		.run-header-status {
			font-size: 11px;
			padding: 2px 8px;
			border-radius: 10px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			font-weight: 600;
		}

		.run-header-status.running {
			background: rgba(245, 166, 35, 0.15);
			color: var(--amber);
		}

		.run-header-status.completed {
			background: var(--success-bg);
			color: #6FCF6F;
		}

		.run-header-status.error {
			background: var(--error-bg);
			color: #CF6F6F;
		}

		.run-header-status.pending {
			background: rgba(136, 136, 136, 0.15);
			color: var(--text-secondary);
		}

		.run-header-spacer {
			flex: 1;
		}

		.run-header-stats {
			display: flex;
			gap: 12px;
			font-size: 11px;
			color: var(--text-secondary);
			font-family: var(--font-mono);
		}

		/* ---- Message Stream ---- */
		.message-stream {
			flex: 1;
			overflow-y: auto;
			padding: 16px;
			scroll-behavior: smooth;
		}

		.message-stream::-webkit-scrollbar {
			width: 6px;
		}

		.message-stream::-webkit-scrollbar-track {
			background: transparent;
		}

		.message-stream::-webkit-scrollbar-thumb {
			background: var(--card-border);
			border-radius: 3px;
		}

		/* ---- Text Messages ---- */
		.msg-block {
			margin-bottom: 16px;
		}

		.msg-block.user .msg-content {
			background: var(--card-bg);
			border: 1px solid var(--card-border);
			border-radius: 8px;
			padding: 10px 14px;
		}

		.msg-block.assistant .msg-content {
			padding: 4px 0;
		}

		.msg-role {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			margin-bottom: 4px;
			color: var(--text-secondary);
		}

		.msg-role.user {
			color: var(--text-secondary);
		}

		.msg-role.assistant {
			color: var(--amber);
		}

		.msg-content {
			word-wrap: break-word;
			overflow-wrap: break-word;
		}

		.msg-content p {
			margin: 0 0 8px 0;
		}

		.msg-content p:last-child {
			margin-bottom: 0;
		}

		.msg-content strong {
			font-weight: 600;
		}

		.msg-content em {
			font-style: italic;
			color: var(--text-secondary);
		}

		.msg-content code {
			font-family: var(--font-mono);
			font-size: 12px;
			background: rgba(255, 255, 255, 0.06);
			padding: 2px 5px;
			border-radius: 3px;
		}

		.msg-content pre {
			background: #0A0A0A;
			border: 1px solid var(--card-border);
			border-radius: 6px;
			padding: 12px;
			margin: 8px 0;
			overflow-x: auto;
			position: relative;
		}

		.msg-content pre code {
			background: none;
			padding: 0;
			font-size: 12px;
			line-height: 1.4;
		}

		.msg-content h1, .msg-content h2, .msg-content h3 {
			margin: 12px 0 6px 0;
			color: var(--text-primary);
		}

		.msg-content h1 { font-size: 18px; }
		.msg-content h2 { font-size: 16px; }
		.msg-content h3 { font-size: 14px; }

		.msg-content ul, .msg-content ol {
			margin: 4px 0 8px 20px;
		}

		.msg-content li {
			margin-bottom: 2px;
		}

		/* ---- Streaming cursor ---- */
		.streaming-cursor::after {
			content: '';
			display: inline-block;
			width: 7px;
			height: 14px;
			background: var(--amber);
			margin-left: 2px;
			animation: blink 1s step-end infinite;
			vertical-align: text-bottom;
		}

		@keyframes blink {
			50% { opacity: 0; }
		}

		/* ---- Tool Call Cards ---- */
		.tool-card {
			background: var(--card-bg);
			border: 1px solid var(--card-border);
			border-left: 3px solid var(--amber);
			border-radius: 6px;
			margin: 8px 0;
			overflow: hidden;
		}

		.tool-card-header {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			cursor: pointer;
			user-select: none;
		}

		.tool-card-header:hover {
			background: rgba(255, 255, 255, 0.02);
		}

		.tool-card-chevron {
			font-size: 10px;
			color: var(--text-secondary);
			transition: transform 0.15s;
			flex-shrink: 0;
		}

		.tool-card-chevron.expanded {
			transform: rotate(90deg);
		}

		.tool-card-icon {
			flex-shrink: 0;
			width: 16px;
			text-align: center;
		}

		.tool-card-name {
			font-weight: 600;
			font-size: 12px;
			color: var(--text-primary);
			flex: 1;
		}

		.tool-card-status {
			font-size: 12px;
			flex-shrink: 0;
		}

		.tool-card-status.running {
			color: var(--amber);
			animation: pulse 1.5s ease-in-out infinite;
		}

		.tool-card-status.success {
			color: #6FCF6F;
		}

		.tool-card-status.error {
			color: #CF6F6F;
		}

		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.4; }
		}

		.tool-card-body {
			display: none;
			padding: 0 12px 10px 12px;
			border-top: 1px solid var(--card-border);
		}

		.tool-card-body.visible {
			display: block;
		}

		.tool-card-args {
			font-family: var(--font-mono);
			font-size: 11px;
			color: var(--text-secondary);
			white-space: pre-wrap;
			word-break: break-all;
			margin-top: 8px;
			max-height: 200px;
			overflow-y: auto;
		}

		.tool-card-result {
			margin-top: 8px;
			padding-top: 8px;
			border-top: 1px solid var(--card-border);
		}

		.tool-card-result-label {
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--text-secondary);
			margin-bottom: 4px;
		}

		.tool-card-result-content {
			font-family: var(--font-mono);
			font-size: 11px;
			color: var(--text-secondary);
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 300px;
			overflow-y: auto;
		}

		.tool-card-result-content.is-error {
			color: #CF6F6F;
		}

		/* ---- Reasoning Blocks ---- */
		.reasoning-block {
			background: var(--reasoning-bg);
			border: 1px solid var(--card-border);
			border-radius: 6px;
			margin: 8px 0;
			overflow: hidden;
		}

		.reasoning-header {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 12px;
			cursor: pointer;
			user-select: none;
			font-size: 12px;
			color: var(--text-secondary);
			font-style: italic;
		}

		.reasoning-header:hover {
			background: rgba(255, 255, 255, 0.02);
		}

		.reasoning-chevron {
			font-size: 10px;
			transition: transform 0.15s;
		}

		.reasoning-chevron.expanded {
			transform: rotate(90deg);
		}

		.reasoning-body {
			display: none;
			padding: 8px 12px;
			font-style: italic;
			color: var(--text-secondary);
			font-size: 12px;
			line-height: 1.5;
			border-top: 1px solid var(--card-border);
			max-height: 400px;
			overflow-y: auto;
		}

		.reasoning-body.visible {
			display: block;
		}

		/* ---- Activity Indicators ---- */
		.activity-indicator {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 6px 0;
			font-size: 12px;
			color: var(--text-secondary);
		}

		.activity-spinner {
			width: 12px;
			height: 12px;
			border: 2px solid var(--card-border);
			border-top-color: var(--amber);
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			flex-shrink: 0;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		.activity-icon {
			flex-shrink: 0;
			width: 16px;
			text-align: center;
			font-size: 12px;
		}

		/* ---- Selection Cards ---- */
		.selection-card {
			background: var(--card-bg);
			border: 1px solid var(--amber);
			border-radius: 8px;
			margin: 12px 0;
			padding: 14px;
		}

		.selection-title {
			font-weight: 600;
			font-size: 13px;
			color: var(--amber);
			margin-bottom: 4px;
		}

		.selection-desc {
			font-size: 12px;
			color: var(--text-secondary);
			margin-bottom: 10px;
		}

		.selection-options {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}

		.selection-btn {
			background: rgba(245, 166, 35, 0.1);
			border: 1px solid var(--muted-gold);
			border-radius: 6px;
			padding: 6px 14px;
			color: var(--amber);
			font-size: 12px;
			font-family: var(--font-ui);
			cursor: pointer;
			transition: background 0.15s, border-color 0.15s;
		}

		.selection-btn:hover {
			background: rgba(245, 166, 35, 0.2);
			border-color: var(--amber);
		}

		.selection-btn.selected {
			background: rgba(245, 166, 35, 0.25);
			border-color: var(--amber);
			font-weight: 600;
		}

		.selection-btn:disabled {
			opacity: 0.4;
			cursor: default;
		}

		/* ---- Input Area ---- */
		.input-area {
			flex-shrink: 0;
			background: var(--card-bg);
			border-top: 1px solid var(--card-border);
			padding: 12px 16px;
		}

		.input-row {
			display: flex;
			gap: 8px;
			align-items: flex-end;
		}

		.input-textarea {
			flex: 1;
			background: var(--bg);
			border: 1px solid var(--card-border);
			border-radius: 8px;
			padding: 8px 12px;
			color: var(--text-primary);
			font-family: var(--font-ui);
			font-size: 13px;
			line-height: 1.4;
			resize: none;
			min-height: 36px;
			max-height: 160px;
			outline: none;
			transition: border-color 0.15s;
		}

		.input-textarea:focus {
			border-color: var(--amber);
		}

		.input-textarea::placeholder {
			color: var(--text-secondary);
		}

		.input-controls {
			display: flex;
			gap: 6px;
			flex-shrink: 0;
		}

		.input-btn {
			background: none;
			border: 1px solid var(--card-border);
			border-radius: 6px;
			padding: 6px 10px;
			color: var(--text-secondary);
			font-family: var(--font-ui);
			font-size: 12px;
			cursor: pointer;
			transition: color 0.15s, border-color 0.15s;
			white-space: nowrap;
		}

		.input-btn:hover {
			color: var(--text-primary);
			border-color: var(--text-secondary);
		}

		.input-btn.primary {
			background: var(--amber);
			border-color: var(--amber);
			color: #000;
			font-weight: 600;
		}

		.input-btn.primary:hover {
			background: #D4911F;
			border-color: #D4911F;
		}

		.input-btn.primary:disabled {
			opacity: 0.4;
			cursor: default;
		}

		.input-btn.cancel {
			border-color: #CF6F6F;
			color: #CF6F6F;
		}

		.input-btn.cancel:hover {
			background: rgba(207, 111, 111, 0.1);
		}

		.input-btn.cancel.hidden {
			display: none;
		}

		.model-select {
			background: var(--bg);
			border: 1px solid var(--card-border);
			border-radius: 6px;
			padding: 4px 8px;
			color: var(--text-secondary);
			font-family: var(--font-ui);
			font-size: 11px;
			outline: none;
			cursor: pointer;
		}

		.model-select:focus {
			border-color: var(--amber);
		}

		.input-bottom-row {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 8px;
		}

		/* ---- Error banner ---- */
		.error-banner {
			background: var(--error-bg);
			border: 1px solid #5A3A3A;
			border-radius: 6px;
			padding: 8px 12px;
			margin: 8px 0;
			font-size: 12px;
			color: #CF6F6F;
		}
	</style>
</head>
<body>
	<div class="agent-chat">
		<!-- Run Info Header -->
		<div class="run-header" id="runHeader">
			<span class="run-header-agent" id="headerAgent">Son of Anton</span>
			<span class="run-header-model" id="headerModel"></span>
			<span class="run-header-status pending" id="headerStatus">idle</span>
			<span class="run-header-spacer"></span>
			<span class="run-header-stats">
				<span id="headerTokens"></span>
				<span id="headerCost"></span>
				<span id="headerElapsed"></span>
			</span>
		</div>

		<!-- Message Stream -->
		<div class="message-stream" id="messageStream"></div>

		<!-- Input Area -->
		<div class="input-area">
			<div class="input-row">
				<textarea
					class="input-textarea"
					id="inputTextarea"
					placeholder="Ask Son of Anton..."
					rows="1"
				></textarea>
				<div class="input-controls">
					<button class="input-btn primary" id="sendBtn">Send</button>
					<button class="input-btn cancel hidden" id="cancelBtn">Cancel</button>
				</div>
			</div>
			<div class="input-bottom-row">
				<select class="model-select" id="modelSelect">
					<option value="opus">Opus</option>
					<option value="sonnet" selected>Sonnet</option>
					<option value="haiku">Haiku</option>
				</select>
				<button class="input-btn" id="attachBtn">Attach File</button>
			</div>
		</div>
	</div>

	<script nonce="${nonce}">
		// ==================================================================
		// Agent Chat Webview Script
		// ==================================================================
		const vscode = acquireVsCodeApi();

		// ---- DOM refs ----
		const messageStream = document.getElementById('messageStream');
		const inputTextarea = document.getElementById('inputTextarea');
		const sendBtn = document.getElementById('sendBtn');
		const cancelBtn = document.getElementById('cancelBtn');
		const modelSelect = document.getElementById('modelSelect');
		const attachBtn = document.getElementById('attachBtn');
		const headerAgent = document.getElementById('headerAgent');
		const headerModel = document.getElementById('headerModel');
		const headerStatus = document.getElementById('headerStatus');
		const headerTokens = document.getElementById('headerTokens');
		const headerCost = document.getElementById('headerCost');
		const headerElapsed = document.getElementById('headerElapsed');

		// ---- State ----
		let isRunning = false;
		let currentTextMessageEl = null;
		let currentTextBuffer = '';
		let toolCards = {};          // toolCallId -> DOM element
		let toolArgsBuffers = {};    // toolCallId -> accumulated args string
		let reasoningBlocks = {};    // messageId -> DOM element
		let reasoningBuffers = {};   // messageId -> accumulated text
		let startTime = 0;
		let elapsedTimer = null;

		// ==================================================================
		// Simple Markdown Renderer
		// All input is escaped via escapeHtml before any rendering to
		// prevent script injection in this sandboxed, CSP-restricted webview.
		// ==================================================================
		function escapeHtml(text) {
			const el = document.createElement('span');
			el.textContent = text;
			return el.innerHTML;
		}

		function renderMarkdown(text) {
			// Extract fenced code blocks first so they are not processed
			var codeBlocks = [];
			var cbIndex = 0;
			var processed = text.replace(/\`\`\`(\\w*)\n([\\s\\S]*?)\`\`\`/g, function(_, lang, code) {
				var i = cbIndex++;
				codeBlocks[i] = { lang: lang, code: code };
				return '@@CB' + i + '@@';
			});

			// Escape all HTML entities in the non-code content
			var html = escapeHtml(processed);

			// Headers (### before ## before #)
			html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
			html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
			html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

			// Bold
			html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

			// Italic (single *)
			html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

			// Inline code
			html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

			// Unordered lists
			html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
			html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

			// Double newlines to paragraph breaks
			html = html.replace(/\n\n/g, '</p><p>');
			html = '<p>' + html + '</p>';

			// Single newlines to <br>
			html = html.replace(/\n/g, '<br>');

			// Clean up empty paragraphs
			html = html.replace(/<p><\/p>/g, '');
			html = html.replace(/<p><br>/g, '<p>');

			// Restore code blocks with escaped content
			html = html.replace(/@@CB(\d+)@@/g, function(_, numStr) {
				var i = parseInt(numStr, 10);
				var block = codeBlocks[i];
				if (!block) { return ''; }
				return '</p><pre><code>' + escapeHtml(block.code) + '</code></pre><p>';
			});

			return html;
		}

		// ==================================================================
		// DOM helpers
		// ==================================================================
		function scrollToBottom() {
			messageStream.scrollTop = messageStream.scrollHeight;
		}

		function isNearBottom() {
			var threshold = 80;
			return (messageStream.scrollHeight - messageStream.scrollTop - messageStream.clientHeight) < threshold;
		}

		function maybeScroll() {
			if (isNearBottom()) {
				scrollToBottom();
			}
		}

		function setRunning(running) {
			isRunning = running;
			sendBtn.disabled = running;
			cancelBtn.classList.toggle('hidden', !running);
		}

		function updateElapsedTime() {
			if (startTime > 0) {
				var seconds = Math.floor((Date.now() - startTime) / 1000);
				var mins = Math.floor(seconds / 60);
				var secs = seconds % 60;
				headerElapsed.textContent = mins > 0
					? mins + 'm ' + secs + 's'
					: secs + 's';
			}
		}

		function activityIconFor(activityType) {
			var icons = {
				'planning': '\u{1F9E0}',
				'searching': '\u{1F50D}',
				'reading': '\u{1F4C4}',
				'writing': '\u{270F}',
				'testing': '\u{1F9EA}',
				'reviewing': '\u{1F440}',
				'mcp_call': '\u{1F517}',
				'thinking': '\u{1F4AD}'
			};
			return icons[activityType] || '\u{26A1}';
		}

		// ==================================================================
		// AG-UI Event Handlers
		// ==================================================================

		function handleAgUiEvent(event) {
			switch (event.type) {
				case 'RUN_STARTED':
					handleRunStarted(event);
					break;
				case 'RUN_FINISHED':
					handleRunFinished(event);
					break;
				case 'RUN_ERROR':
					handleRunError(event);
					break;
				case 'TEXT_MESSAGE_START':
					handleTextMessageStart(event);
					break;
				case 'TEXT_MESSAGE_CONTENT':
					handleTextMessageContent(event);
					break;
				case 'TEXT_MESSAGE_END':
					handleTextMessageEnd(event);
					break;
				case 'TOOL_CALL_START':
					handleToolCallStart(event);
					break;
				case 'TOOL_CALL_ARGS':
					handleToolCallArgs(event);
					break;
				case 'TOOL_CALL_END':
					handleToolCallEnd(event);
					break;
				case 'TOOL_CALL_RESULT':
					handleToolCallResult(event);
					break;
				case 'REASONING_START':
					handleReasoningStart(event);
					break;
				case 'REASONING_CONTENT':
					handleReasoningContent(event);
					break;
				case 'REASONING_END':
					handleReasoningEnd(event);
					break;
				case 'ACTIVITY_SNAPSHOT':
					handleActivitySnapshot(event);
					break;
				case 'STEP_STARTED':
				case 'STEP_FINISHED':
					// Silently consumed — no visual representation
					break;
				default:
					break;
			}
		}

		function handleRunStarted(event) {
			headerAgent.textContent = event.agentName || 'Son of Anton';
			headerModel.textContent = event.model || '';
			headerStatus.textContent = 'running';
			headerStatus.className = 'run-header-status running';
			startTime = event.timestamp || Date.now();
			elapsedTimer = setInterval(updateElapsedTime, 1000);
			setRunning(true);
		}

		function handleRunFinished(event) {
			headerStatus.textContent = 'completed';
			headerStatus.className = 'run-header-status completed';
			if (event.inputTokens !== undefined) {
				headerTokens.textContent = (event.inputTokens + event.outputTokens).toLocaleString() + ' tok';
			}
			if (event.costUsd !== undefined) {
				headerCost.textContent = '$' + event.costUsd.toFixed(4);
			}
			if (event.elapsedMs !== undefined) {
				var secs = (event.elapsedMs / 1000).toFixed(1);
				headerElapsed.textContent = secs + 's';
			}
			if (elapsedTimer) {
				clearInterval(elapsedTimer);
				elapsedTimer = null;
			}
			setRunning(false);
			finishCurrentTextMessage();
		}

		function handleRunError(event) {
			headerStatus.textContent = 'error';
			headerStatus.className = 'run-header-status error';
			if (elapsedTimer) {
				clearInterval(elapsedTimer);
				elapsedTimer = null;
			}
			setRunning(false);
			finishCurrentTextMessage();

			var banner = document.createElement('div');
			banner.className = 'error-banner';
			banner.textContent = event.message || 'An error occurred.';
			messageStream.appendChild(banner);
			maybeScroll();
		}

		// ---- Text Messages ----
		function handleTextMessageStart(event) {
			finishCurrentTextMessage();

			var block = document.createElement('div');
			block.className = 'msg-block ' + event.role;
			block.dataset.messageId = event.messageId;

			var role = document.createElement('div');
			role.className = 'msg-role ' + event.role;
			role.textContent = event.role === 'user' ? 'You' : 'Son of Anton';
			block.appendChild(role);

			var content = document.createElement('div');
			content.className = 'msg-content streaming-cursor';
			block.appendChild(content);

			messageStream.appendChild(block);
			currentTextMessageEl = content;
			currentTextBuffer = '';
			maybeScroll();
		}

		function handleTextMessageContent(event) {
			if (!currentTextMessageEl) { return; }
			currentTextBuffer += event.delta;
			// Render escaped markdown incrementally
			currentTextMessageEl.innerHTML = renderMarkdown(currentTextBuffer);
			// Re-add the cursor class since innerHTML replaces children
			currentTextMessageEl.classList.add('streaming-cursor');
			maybeScroll();
		}

		function handleTextMessageEnd(_event) {
			finishCurrentTextMessage();
		}

		function finishCurrentTextMessage() {
			if (currentTextMessageEl) {
				currentTextMessageEl.innerHTML = renderMarkdown(currentTextBuffer);
				currentTextMessageEl.classList.remove('streaming-cursor');
				currentTextMessageEl = null;
				currentTextBuffer = '';
				maybeScroll();
			}
		}

		// ---- Tool Calls ----
		function handleToolCallStart(event) {
			var card = document.createElement('div');
			card.className = 'tool-card';
			card.dataset.toolCallId = event.toolCallId;

			var header = document.createElement('div');
			header.className = 'tool-card-header';

			var chevron = document.createElement('span');
			chevron.className = 'tool-card-chevron';
			chevron.textContent = '\u25B6';

			var icon = document.createElement('span');
			icon.className = 'tool-card-icon';
			icon.textContent = '\u2692';

			var name = document.createElement('span');
			name.className = 'tool-card-name';
			name.textContent = event.toolCallName;

			var status = document.createElement('span');
			status.className = 'tool-card-status running';
			status.textContent = '\u25CF';

			header.appendChild(chevron);
			header.appendChild(icon);
			header.appendChild(name);
			header.appendChild(status);

			var body = document.createElement('div');
			body.className = 'tool-card-body';

			var args = document.createElement('div');
			args.className = 'tool-card-args';
			body.appendChild(args);

			card.appendChild(header);
			card.appendChild(body);

			// Toggle collapse on click
			header.addEventListener('click', function() {
				var isExpanded = body.classList.contains('visible');
				body.classList.toggle('visible', !isExpanded);
				chevron.classList.toggle('expanded', !isExpanded);
			});

			messageStream.appendChild(card);
			toolCards[event.toolCallId] = card;
			toolArgsBuffers[event.toolCallId] = '';
			maybeScroll();
		}

		function handleToolCallArgs(event) {
			var card = toolCards[event.toolCallId];
			if (!card) { return; }
			toolArgsBuffers[event.toolCallId] = (toolArgsBuffers[event.toolCallId] || '') + event.delta;
			var argsEl = card.querySelector('.tool-card-args');
			if (argsEl) {
				// Try to pretty-print if the accumulated buffer is valid JSON
				var display = toolArgsBuffers[event.toolCallId];
				try {
					var parsed = JSON.parse(display);
					display = JSON.stringify(parsed, null, 2);
				} catch (_) {
					// Not valid JSON yet — show raw text
				}
				argsEl.textContent = display;
			}
			maybeScroll();
		}

		function handleToolCallEnd(event) {
			var card = toolCards[event.toolCallId];
			if (!card) { return; }
			var status = card.querySelector('.tool-card-status');
			if (status) {
				status.className = 'tool-card-status success';
				status.textContent = '\u2713';
			}
		}

		function handleToolCallResult(event) {
			var card = toolCards[event.toolCallId];
			if (!card) { return; }
			var body = card.querySelector('.tool-card-body');
			if (!body) { return; }

			// Update status icon if this is an error result
			if (event.isError) {
				var status = card.querySelector('.tool-card-status');
				if (status) {
					status.className = 'tool-card-status error';
					status.textContent = '\u2717';
				}
			}

			var result = document.createElement('div');
			result.className = 'tool-card-result';

			var label = document.createElement('div');
			label.className = 'tool-card-result-label';
			label.textContent = event.isError ? 'Error' : 'Result';

			var content = document.createElement('div');
			content.className = 'tool-card-result-content' + (event.isError ? ' is-error' : '');

			// Truncate very long results for readability
			var resultText = event.content || '';
			if (resultText.length > 5000) {
				resultText = resultText.substring(0, 5000) + '\n... (truncated)';
			}
			content.textContent = resultText;

			result.appendChild(label);
			result.appendChild(content);
			body.appendChild(result);

			// Auto-expand the card body to show the result
			body.classList.add('visible');
			var chevron = card.querySelector('.tool-card-chevron');
			if (chevron) {
				chevron.classList.add('expanded');
			}
			maybeScroll();
		}

		// ---- Reasoning ----
		function handleReasoningStart(event) {
			var block = document.createElement('div');
			block.className = 'reasoning-block';
			block.dataset.messageId = event.messageId;

			var header = document.createElement('div');
			header.className = 'reasoning-header';

			var chevron = document.createElement('span');
			chevron.className = 'reasoning-chevron';
			chevron.textContent = '\u25B6';

			var label = document.createElement('span');
			label.textContent = 'Thinking...';

			header.appendChild(chevron);
			header.appendChild(label);

			var body = document.createElement('div');
			body.className = 'reasoning-body';

			header.addEventListener('click', function() {
				var isExpanded = body.classList.contains('visible');
				body.classList.toggle('visible', !isExpanded);
				chevron.classList.toggle('expanded', !isExpanded);
			});

			block.appendChild(header);
			block.appendChild(body);

			messageStream.appendChild(block);
			reasoningBlocks[event.messageId] = block;
			reasoningBuffers[event.messageId] = '';
			maybeScroll();
		}

		function handleReasoningContent(event) {
			var block = reasoningBlocks[event.messageId];
			if (!block) { return; }
			reasoningBuffers[event.messageId] = (reasoningBuffers[event.messageId] || '') + event.delta;
			var body = block.querySelector('.reasoning-body');
			if (body) {
				body.textContent = reasoningBuffers[event.messageId];
			}
			maybeScroll();
		}

		function handleReasoningEnd(event) {
			var block = reasoningBlocks[event.messageId];
			if (!block) { return; }
			var header = block.querySelector('.reasoning-header');
			if (header) {
				var label = header.querySelector('span:last-child');
				if (label) {
					label.textContent = 'Thought process';
				}
			}
		}

		// ---- Activity ----
		function handleActivitySnapshot(event) {
			var indicator = document.createElement('div');
			indicator.className = 'activity-indicator';
			indicator.dataset.messageId = event.messageId;

			var spinner = document.createElement('div');
			spinner.className = 'activity-spinner';

			var icon = document.createElement('span');
			icon.className = 'activity-icon';
			icon.textContent = activityIconFor(event.activityType);

			var text = document.createElement('span');
			text.textContent = event.content;

			indicator.appendChild(spinner);
			indicator.appendChild(icon);
			indicator.appendChild(text);

			messageStream.appendChild(indicator);
			maybeScroll();
		}

		// ---- Selection Cards ----
		function showSelectionCard(request) {
			var card = document.createElement('div');
			card.className = 'selection-card';
			card.dataset.requestId = request.requestId;

			var title = document.createElement('div');
			title.className = 'selection-title';
			title.textContent = request.title;
			card.appendChild(title);

			if (request.description) {
				var desc = document.createElement('div');
				desc.className = 'selection-desc';
				desc.textContent = request.description;
				card.appendChild(desc);
			}

			var options = document.createElement('div');
			options.className = 'selection-options';

			request.options.forEach(function(opt) {
				var btn = document.createElement('button');
				btn.className = 'selection-btn';
				btn.textContent = opt.label;
				if (opt.description) {
					btn.title = opt.description;
				}
				btn.addEventListener('click', function() {
					// Disable all option buttons after selection
					var allBtns = card.querySelectorAll('.selection-btn');
					allBtns.forEach(function(b) { b.disabled = true; });
					btn.classList.add('selected');

					vscode.postMessage({
						type: 'selectionResponse',
						requestId: request.requestId,
						values: [opt.value]
					});
				});
				options.appendChild(btn);
			});

			card.appendChild(options);
			messageStream.appendChild(card);
			maybeScroll();
		}

		// ==================================================================
		// Run Info Update
		// ==================================================================
		function handleRunInfoUpdate(info) {
			headerAgent.textContent = info.agentName || 'Son of Anton';
			headerModel.textContent = info.model || '';

			headerStatus.textContent = info.status;
			headerStatus.className = 'run-header-status ' + info.status;

			if (info.inputTokens > 0 || info.outputTokens > 0) {
				headerTokens.textContent = (info.inputTokens + info.outputTokens).toLocaleString() + ' tok';
			}
			if (info.costUsd > 0) {
				headerCost.textContent = '$' + info.costUsd.toFixed(4);
			}

			var isActive = info.status === 'running' || info.status === 'pending';
			setRunning(isActive);
		}

		// ==================================================================
		// Message listener — receives messages from the extension host
		// ==================================================================
		window.addEventListener('message', function(ev) {
			var msg = ev.data;
			if (!msg || !msg.type) { return; }

			switch (msg.type) {
				case 'agUiEvent':
					handleAgUiEvent(msg.event);
					break;
				case 'runInfoUpdate':
					handleRunInfoUpdate(msg.info);
					break;
				case 'selectionRequest':
					showSelectionCard(msg.request);
					break;
				case 'runCleared':
					messageStream.textContent = '';
					currentTextMessageEl = null;
					currentTextBuffer = '';
					toolCards = {};
					toolArgsBuffers = {};
					reasoningBlocks = {};
					reasoningBuffers = {};
					if (elapsedTimer) {
						clearInterval(elapsedTimer);
						elapsedTimer = null;
					}
					headerAgent.textContent = 'Son of Anton';
					headerModel.textContent = '';
					headerStatus.textContent = 'idle';
					headerStatus.className = 'run-header-status pending';
					headerTokens.textContent = '';
					headerCost.textContent = '';
					headerElapsed.textContent = '';
					setRunning(false);
					break;
			}
		});

		// ==================================================================
		// Input handling
		// ==================================================================
		function sendPrompt() {
			var text = inputTextarea.value.trim();
			if (!text || isRunning) { return; }

			// Show user message immediately in the stream
			var block = document.createElement('div');
			block.className = 'msg-block user';
			var role = document.createElement('div');
			role.className = 'msg-role user';
			role.textContent = 'You';
			block.appendChild(role);
			var content = document.createElement('div');
			content.className = 'msg-content';
			content.innerHTML = renderMarkdown(text);
			block.appendChild(content);
			messageStream.appendChild(block);
			scrollToBottom();

			vscode.postMessage({
				type: 'sendPrompt',
				text: text,
				model: modelSelect.value
			});

			inputTextarea.value = '';
			inputTextarea.style.height = 'auto';
		}

		sendBtn.addEventListener('click', sendPrompt);

		inputTextarea.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendPrompt();
			}
		});

		// Auto-resize textarea as user types
		inputTextarea.addEventListener('input', function() {
			inputTextarea.style.height = 'auto';
			inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 160) + 'px';
		});

		cancelBtn.addEventListener('click', function() {
			vscode.postMessage({ type: 'cancelRun' });
		});

		attachBtn.addEventListener('click', function() {
			vscode.postMessage({ type: 'attachFile' });
		});

		modelSelect.addEventListener('change', function() {
			vscode.postMessage({ type: 'changeModel', model: modelSelect.value });
		});

		// Notify extension host that the webview is ready to receive messages
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
}
