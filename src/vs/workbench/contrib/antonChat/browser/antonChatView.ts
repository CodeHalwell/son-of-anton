/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/antonChat.css';
import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import {
	ChatMessageRole,
	ChatMessageStatus,
	IChatMessage,
	SLASH_COMMANDS,
} from '../common/antonChatTypes.js';
import { IAntonChatService } from './antonChatService.js';

export const ANTON_CHAT_VIEW_ID = 'workbench.view.soaAntonChat';

export class AntonChatView extends ViewPane {

	static readonly ID = ANTON_CHAT_VIEW_ID;

	private bodyRoot: HTMLElement | undefined;
	private messageList: HTMLElement | undefined;
	private textarea: HTMLElement | undefined;
	private sendBtn: HTMLButtonElement | undefined;
	private slashPalette: HTMLElement | undefined;
	private readonly viewDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAntonChatService private readonly chatService: IAntonChatService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.chatService.onDidAddMessage(msg => this.onMessageAdded(msg)));
		this._register(this.chatService.onDidUpdateMessage(msg => this.onMessageUpdated(msg)));
		this._register(this.chatService.onDidChangeSession(() => this.renderMessages()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.bodyRoot = append(container, $('div.anton-chat-root'));
		this.renderView();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.bodyRoot) {
			this.bodyRoot.style.height = `${height}px`;
			this.bodyRoot.style.width = `${width}px`;
		}
	}

	private renderView(): void {
		if (!this.bodyRoot) {
			return;
		}
		this.viewDisposables.clear();
		this.bodyRoot.textContent = '';

		const session = this.chatService.session;

		if (session.messages.length === 0) {
			this.renderWelcome();
		} else {
			this.renderChatUI();
		}
	}

	// ── Welcome state ──

	private renderWelcome(): void {
		if (!this.bodyRoot) {
			return;
		}

		const welcome = append(this.bodyRoot, $('div.anton-welcome'));

		const icon = append(welcome, $('div.anton-welcome-icon'));
		const iconEl = append(icon, $(ThemeIcon.asCSSSelector(Codicon.hubot)));
		iconEl.style.fontSize = '48px';

		const title = append(welcome, $('h3.anton-welcome-title'));
		title.textContent = localize('antonChat.welcomeTitle', "Anton Orchestrator");

		const subtitle = append(welcome, $('p.anton-welcome-subtitle'));
		subtitle.textContent = localize('antonChat.welcomeSubtitle', "Ask me to plan, build, review, or explore your codebase. I coordinate specialist agents to get things done.");

		const hints = append(welcome, $('div.anton-welcome-hints'));

		const hintData = [
			{ icon: Codicon.lightbulb, text: '"Plan a new authentication module"' },
			{ icon: Codicon.beaker, text: '"Review and test my latest changes"' },
			{ icon: Codicon.search, text: '"Explore how the DAG builder works"' },
			{ icon: Codicon.shield, text: '"Run a security scan on the workspace"' },
		];

		for (const hint of hintData) {
			const hintEl = append(hints, $('div.anton-welcome-hint'));

			const hintIcon = append(hintEl, $('span.anton-welcome-hint-icon'));
			append(hintIcon, $(ThemeIcon.asCSSSelector(hint.icon)));

			const hintText = append(hintEl, $('span.anton-welcome-hint-text'));
			hintText.textContent = hint.text;

			this.viewDisposables.add(addDisposableListener(hintEl, EventType.CLICK, () => {
				this.submitMessage(hint.text.replace(/^"|"$/g, ''));
			}));
		}

		// Still show the input area below
		this.renderInputArea();
	}

	// ── Chat UI ──

	private renderChatUI(): void {
		if (!this.bodyRoot) {
			return;
		}

		// Header
		const header = append(this.bodyRoot, $('div.anton-header'));

		const headerLeft = append(header, $('div.anton-header-left'));
		append(headerLeft, $('div.anton-header-status'));
		const headerTitle = append(headerLeft, $('span.anton-header-title'));
		headerTitle.textContent = localize('antonChat.headerTitle', "Anton");

		const headerActions = append(header, $('div.anton-header-actions'));
		const clearBtn = append(headerActions, $('button.anton-header-btn'));
		clearBtn.title = localize('antonChat.clearSession', "Clear session");
		append(clearBtn, $(ThemeIcon.asCSSSelector(Codicon.clearAll)));
		this.viewDisposables.add(addDisposableListener(clearBtn, EventType.CLICK, () => {
			this.chatService.clearSession();
			this.renderView();
		}));

		// Message list
		this.messageList = append(this.bodyRoot, $('div.anton-messages'));
		this.renderMessages();

		// Input
		this.renderInputArea();
	}

	private renderMessages(): void {
		if (!this.messageList) {
			return;
		}
		this.messageList.textContent = '';
		for (const msg of this.chatService.session.messages) {
			this.appendMessageElement(msg);
		}
		this.scrollToBottom();
	}

	private appendMessageElement(msg: IChatMessage): void {
		if (!this.messageList) {
			return;
		}

		const roleClass = msg.role === ChatMessageRole.User ? 'anton-msg-user' : 'anton-msg-assistant';
		const statusClass = msg.status === ChatMessageStatus.Streaming ? 'anton-msg-streaming'
			: msg.status === ChatMessageStatus.Error ? 'anton-msg-error' : '';

		const msgEl = append(this.messageList, $(`div.anton-msg.${roleClass}${statusClass ? '.' + statusClass : ''}`));
		msgEl.dataset.msgId = msg.id;

		// Header
		const msgHeader = append(msgEl, $('div.anton-msg-header'));
		const roleLabel = append(msgHeader, $('span.anton-msg-role'));
		roleLabel.textContent = msg.role === ChatMessageRole.User
			? localize('antonChat.you', "You")
			: localize('antonChat.anton', "Anton");

		const timeLabel = append(msgHeader, $('span.anton-msg-time'));
		timeLabel.textContent = this.formatTime(msg.timestamp);

		// Body
		const body = append(msgEl, $('div.anton-msg-body'));
		this.renderMessageContent(body, msg.content);

		// Metadata (for completed assistant messages)
		if (msg.role === ChatMessageRole.Assistant && msg.status === ChatMessageStatus.Complete && (msg.modelUsed || msg.tokensIn !== undefined)) {
			const meta = append(msgEl, $('div.anton-msg-meta'));
			if (msg.modelUsed) {
				const model = append(meta, $('span.anton-msg-meta-item'));
				model.textContent = msg.modelUsed;
			}
			if (msg.tokensIn !== undefined) {
				const tokens = append(meta, $('span.anton-msg-meta-item'));
				tokens.textContent = `${msg.tokensIn}/${msg.tokensOut ?? 0} tokens`;
			}
			if (msg.costUsd !== undefined) {
				const cost = append(meta, $('span.anton-msg-meta-item'));
				cost.textContent = `$${msg.costUsd.toFixed(4)}`;
			}
			if (msg.elapsedMs !== undefined) {
				const elapsed = append(meta, $('span.anton-msg-meta-item'));
				elapsed.textContent = `${(msg.elapsedMs / 1000).toFixed(1)}s`;
			}
		}
	}

	private renderMessageContent(container: HTMLElement, text: string): void {
		if (!text) {
			return;
		}

		// Split on code blocks (```...```)
		const parts = text.split(/(```[\s\S]*?```)/g);

		for (const part of parts) {
			if (part.startsWith('```') && part.endsWith('```')) {
				// Code block
				const pre = document.createElement('pre');
				const code = document.createElement('code');
				// Strip the ``` markers and optional language tag
				const inner = part.slice(3, -3);
				const newlineIdx = inner.indexOf('\n');
				code.textContent = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
				pre.appendChild(code);
				container.appendChild(pre);
			} else {
				// Plain text — process inline elements
				this.renderInlineContent(container, part);
			}
		}
	}

	private renderInlineContent(container: HTMLElement, text: string): void {
		// Split on inline code (`...`)
		const parts = text.split(/(`[^`]+`)/g);

		for (const part of parts) {
			if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
				const code = document.createElement('code');
				code.textContent = part.slice(1, -1);
				container.appendChild(code);
			} else {
				// Split by lines for paragraph separation
				const lines = part.split('\n');
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (line.trim()) {
						this.renderTextWithBold(container, line);
					}
					if (i < lines.length - 1) {
						container.appendChild(document.createElement('br'));
					}
				}
			}
		}
	}

	private renderTextWithBold(container: HTMLElement, text: string): void {
		// Split on bold markers (**...**)
		const parts = text.split(/(\*\*[^*]+\*\*)/g);

		for (const part of parts) {
			if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
				const strong = document.createElement('strong');
				strong.textContent = part.slice(2, -2);
				container.appendChild(strong);
			} else if (part) {
				container.appendChild(document.createTextNode(part));
			}
		}
	}

	// ── Input area ──

	private renderInputArea(): void {
		if (!this.bodyRoot) {
			return;
		}

		const inputArea = append(this.bodyRoot, $('div.anton-input-area'));
		const inputPosition = append(inputArea, $('div.anton-input-position'));

		// Slash command palette (hidden by default)
		this.slashPalette = append(inputPosition, $('div.anton-slash-palette'));
		this.slashPalette.style.display = 'none';

		const inputWrapper = append(inputPosition, $('div.anton-input-wrapper'));

		const textarea = document.createElement('textarea');
		textarea.className = 'anton-input-textarea';
		textarea.rows = 1;
		textarea.placeholder = localize('antonChat.placeholder', "Ask Anton anything... (/ for commands)");
		textarea.setAttribute('aria-label', localize('antonChat.inputLabel', "Chat message input"));
		inputWrapper.appendChild(textarea);
		this.textarea = textarea;

		const sendBtn = document.createElement('button');
		sendBtn.className = 'anton-send-btn';
		sendBtn.title = localize('antonChat.send', "Send message");
		sendBtn.disabled = true;
		append(sendBtn, $(ThemeIcon.asCSSSelector(Codicon.send)));
		inputWrapper.appendChild(sendBtn);
		this.sendBtn = sendBtn;

		// Auto-resize textarea
		this.viewDisposables.add(addDisposableListener(textarea, EventType.INPUT, () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
			sendBtn.disabled = textarea.value.trim().length === 0;
			this.handleSlashPalette(textarea.value);
		}));

		// Enter to send, Shift+Enter for newline
		this.viewDisposables.add(addDisposableListener(textarea, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
			if (e.key === 'Escape' && this.slashPalette) {
				this.slashPalette.style.display = 'none';
			}
		}));

		this.viewDisposables.add(addDisposableListener(sendBtn, EventType.CLICK, () => {
			this.handleSend();
		}));
	}

	private handleSend(): void {
		if (!this.textarea || !(this.textarea instanceof HTMLTextAreaElement)) {
			return;
		}
		const value = this.textarea.value.trim();
		if (!value) {
			return;
		}

		this.submitMessage(value);
		this.textarea.value = '';
		this.textarea.style.height = 'auto';
		if (this.sendBtn) {
			this.sendBtn.disabled = true;
		}
		if (this.slashPalette) {
			this.slashPalette.style.display = 'none';
		}
	}

	private submitMessage(content: string): void {
		// If this is the first message, switch from welcome to chat UI
		const wasEmpty = this.chatService.session.messages.length === 0;
		this.chatService.sendMessage(content);
		if (wasEmpty) {
			this.renderView();
		}
	}

	// ── Slash command palette ──

	private handleSlashPalette(value: string): void {
		if (!this.slashPalette) {
			return;
		}

		if (value.startsWith('/')) {
			const query = value.slice(1).toLowerCase();
			const matches = SLASH_COMMANDS.filter(cmd =>
				cmd.command.slice(1).toLowerCase().includes(query)
			);

			if (matches.length > 0) {
				this.slashPalette.textContent = '';
				for (const cmd of matches) {
					const item = append(this.slashPalette, $('div.anton-slash-item'));

					const cmdLabel = append(item, $('span.anton-slash-cmd'));
					cmdLabel.textContent = cmd.command;

					const descLabel = append(item, $('span.anton-slash-desc'));
					descLabel.textContent = cmd.description;

					this.viewDisposables.add(addDisposableListener(item, EventType.CLICK, () => {
						if (this.textarea && this.textarea instanceof HTMLTextAreaElement) {
							this.textarea.value = cmd.command + ' ';
							this.textarea.focus();
						}
						if (this.slashPalette) {
							this.slashPalette.style.display = 'none';
						}
					}));
				}
				this.slashPalette.style.display = 'block';
			} else {
				this.slashPalette.style.display = 'none';
			}
		} else {
			this.slashPalette.style.display = 'none';
		}
	}

	// ── Event handlers ──

	private onMessageAdded(msg: IChatMessage): void {
		if (this.messageList) {
			this.appendMessageElement(msg);
			this.scrollToBottom();
		}
	}

	private onMessageUpdated(msg: IChatMessage): void {
		if (!this.messageList) {
			return;
		}

		const existing = this.messageList.querySelector(`[data-msg-id="${msg.id}"]`);
		if (!existing) {
			return;
		}

		// Update body content
		const body = existing.querySelector('.anton-msg-body');
		if (body) {
			body.textContent = '';
			this.renderMessageContent(body as HTMLElement, msg.content);
		}

		// Update streaming/error status class
		existing.classList.toggle('anton-msg-streaming', msg.status === ChatMessageStatus.Streaming);
		existing.classList.toggle('anton-msg-error', msg.status === ChatMessageStatus.Error);

		// Add metadata if completed
		if (msg.status === ChatMessageStatus.Complete && msg.role === ChatMessageRole.Assistant) {
			const existingMeta = existing.querySelector('.anton-msg-meta');
			if (!existingMeta && (msg.modelUsed || msg.tokensIn !== undefined)) {
				const meta = append(existing as HTMLElement, $('div.anton-msg-meta'));
				if (msg.modelUsed) {
					const model = append(meta, $('span.anton-msg-meta-item'));
					model.textContent = msg.modelUsed;
				}
				if (msg.tokensIn !== undefined) {
					const tokens = append(meta, $('span.anton-msg-meta-item'));
					tokens.textContent = `${msg.tokensIn}/${msg.tokensOut ?? 0} tokens`;
				}
				if (msg.costUsd !== undefined) {
					const cost = append(meta, $('span.anton-msg-meta-item'));
					cost.textContent = `$${msg.costUsd.toFixed(4)}`;
				}
				if (msg.elapsedMs !== undefined) {
					const elapsed = append(meta, $('span.anton-msg-meta-item'));
					elapsed.textContent = `${(msg.elapsedMs / 1000).toFixed(1)}s`;
				}
			}
		}

		this.scrollToBottom();
	}

	// ── Helpers ──

	private scrollToBottom(): void {
		if (this.messageList) {
			this.messageList.scrollTop = this.messageList.scrollHeight;
		}
	}

	private formatTime(timestamp: number): string {
		const d = new Date(timestamp);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}
}
