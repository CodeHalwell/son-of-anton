/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExtToWebviewMessage, WebviewToExtMessage } from '../protocol/types';

/**
 * Type-safe IPC client for webview ↔ extension host communication.
 * Wraps VS Code's `acquireVsCodeApi()` postMessage with typed messages.
 */

interface VsCodeApi {
	postMessage(msg: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

/**
 * Send a typed message to the extension host.
 */
export function postMessage(msg: WebviewToExtMessage): void {
	vscode.postMessage(msg);
}

type MessageHandler = (msg: ExtToWebviewMessage) => void;

const listeners = new Set<MessageHandler>();

/**
 * Subscribe to messages from the extension host.
 * Returns an unsubscribe function.
 */
export function onMessage(handler: MessageHandler): () => void {
	listeners.add(handler);
	return () => listeners.delete(handler);
}

// Wire the global message listener once
window.addEventListener('message', (event: MessageEvent<ExtToWebviewMessage>) => {
	for (const handler of listeners) {
		handler(event.data);
	}
});

/**
 * Persist state across webview hide/show cycles.
 */
export function getState<T>(): T | undefined {
	return vscode.getState() as T | undefined;
}

export function setState<T>(state: T): void {
	vscode.setState(state);
}
