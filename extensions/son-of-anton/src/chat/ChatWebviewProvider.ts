/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ChatService } from './ChatService';
import type { WebviewToExtMessage, ExtToWebviewMessage } from './ChatProtocol';

/**
 * WebviewViewProvider for the Son of Anton chat panel.
 * Renders a React-based chat UI in the auxiliary bar (secondary sidebar).
 *
 * Communication: Extension host <-> Webview via typed postMessage protocol.
 */
export class ChatWebviewProvider implements vscode.WebviewViewProvider {
	static readonly viewType = 'sota.chat';

	private view: vscode.WebviewView | undefined;
	private initialised = false;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly chatService: ChatService,
	) {
		// Wire ChatService output to webview
		chatService.setPostMessage((msg: ExtToWebviewMessage) => {
			this.view?.webview.postMessage(msg);
		});
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
			],
		};

		// Re-wire postMessage when view is re-resolved
		this.chatService.setPostMessage((msg: ExtToWebviewMessage) => {
			webviewView.webview.postMessage(msg);
		});

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		// Handle messages from webview
		webviewView.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
			this.chatService.handleWebviewMessage(msg);
		});

		// Restore session only on first visibility (webview was freshly created).
		// Subsequent visibility changes don't re-send ready because the React
		// component retains its state while the webview is hidden.
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible && !this.initialised) {
				this.initialised = true;
				this.chatService.handleWebviewMessage({ type: 'ready' });
			}
		});
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.css')
		);

		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
	<link href="${styleUri}" rel="stylesheet">
	<title>Son of Anton Chat</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}
