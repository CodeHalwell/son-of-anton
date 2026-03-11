/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAntonGenerationService } from '../common/antonChatGeneration.js';
import {
	ChatMessageRole,
	ChatMessageStatus,
	IChatMessage,
	IChatSession,
} from '../common/antonChatTypes.js';

// --- Service interface ---

export const IAntonChatService = createDecorator<IAntonChatService>('soaAntonChatService');

export interface IAntonChatService {
	readonly _serviceBrand: undefined;

	readonly onDidAddMessage: Event<IChatMessage>;
	readonly onDidUpdateMessage: Event<IChatMessage>;
	readonly onDidChangeSession: Event<IChatSession>;

	readonly session: IChatSession;

	sendMessage(content: string): void;
	appendToLastAssistant(chunk: string): void;
	completeLastAssistant(modelUsed?: string, tokensIn?: number, tokensOut?: number, costUsd?: number, elapsedMs?: number): void;
	failLastAssistant(error: string): void;
	clearSession(): void;
}

// --- Service implementation ---

export class AntonChatService extends Disposable implements IAntonChatService {
	readonly _serviceBrand: undefined;

	private readonly _onDidAddMessage = this._register(new Emitter<IChatMessage>());
	readonly onDidAddMessage: Event<IChatMessage> = this._onDidAddMessage.event;

	private readonly _onDidUpdateMessage = this._register(new Emitter<IChatMessage>());
	readonly onDidUpdateMessage: Event<IChatMessage> = this._onDidUpdateMessage.event;

	private readonly _onDidChangeSession = this._register(new Emitter<IChatSession>());
	readonly onDidChangeSession: Event<IChatSession> = this._onDidChangeSession.event;

	private _session: IChatSession;

	private _activeCts: CancellationTokenSource | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IAntonGenerationService private readonly generationService: IAntonGenerationService,
	) {
		super();
		this._session = {
			id: generateUuid(),
			messages: [],
			createdAt: Date.now(),
		};
	}

	get session(): IChatSession {
		return this._session;
	}

	sendMessage(content: string): void {
		const userMsg: IChatMessage = {
			id: generateUuid(),
			role: ChatMessageRole.User,
			content,
			timestamp: Date.now(),
			status: ChatMessageStatus.Complete,
		};
		this._session = { ...this._session, messages: [...this._session.messages, userMsg] };
		this._onDidAddMessage.fire(userMsg);
		this._onDidChangeSession.fire(this._session);

		// Create a pending assistant response
		const assistantMsg: IChatMessage = {
			id: generateUuid(),
			role: ChatMessageRole.Assistant,
			content: '',
			timestamp: Date.now(),
			status: ChatMessageStatus.Streaming,
			agentId: 'Anton',
		};
		this._session = { ...this._session, messages: [...this._session.messages, assistantMsg] };
		this._onDidAddMessage.fire(assistantMsg);
		this._onDidChangeSession.fire(this._session);

		this.logService.debug('[AntonChat] User message sent, starting generation');

		// Cancel any in-flight generation
		this._activeCts?.cancel();
		this._activeCts?.dispose();

		const cts = new CancellationTokenSource();
		this._activeCts = cts;

		this.generationService.generate(
			{ prompt: content },
			chunk => this.appendToLastAssistant(chunk.text),
			cts.token,
		).then(
			result => {
				this.completeLastAssistant(result.model, undefined, undefined, undefined, result.elapsedMs);
			},
			err => {
				this.failLastAssistant(err?.message ?? 'Generation failed');
			},
		);
	}

	appendToLastAssistant(chunk: string): void {
		const messages = [...this._session.messages];
		const lastIdx = messages.length - 1;
		if (lastIdx >= 0 && messages[lastIdx].role === ChatMessageRole.Assistant) {
			messages[lastIdx] = { ...messages[lastIdx], content: messages[lastIdx].content + chunk };
			this._session = { ...this._session, messages };
			this._onDidUpdateMessage.fire(messages[lastIdx]);
		}
	}

	completeLastAssistant(modelUsed?: string, tokensIn?: number, tokensOut?: number, costUsd?: number, elapsedMs?: number): void {
		const messages = [...this._session.messages];
		const lastIdx = messages.length - 1;
		if (lastIdx >= 0 && messages[lastIdx].role === ChatMessageRole.Assistant) {
			messages[lastIdx] = {
				...messages[lastIdx],
				status: ChatMessageStatus.Complete,
				modelUsed,
				tokensIn,
				tokensOut,
				costUsd,
				elapsedMs,
			};
			this._session = { ...this._session, messages };
			this._onDidUpdateMessage.fire(messages[lastIdx]);
			this._onDidChangeSession.fire(this._session);
		}
	}

	failLastAssistant(error: string): void {
		const messages = [...this._session.messages];
		const lastIdx = messages.length - 1;
		if (lastIdx >= 0 && messages[lastIdx].role === ChatMessageRole.Assistant) {
			messages[lastIdx] = {
				...messages[lastIdx],
				content: error,
				status: ChatMessageStatus.Error,
			};
			this._session = { ...this._session, messages };
			this._onDidUpdateMessage.fire(messages[lastIdx]);
			this._onDidChangeSession.fire(this._session);
		}
	}

	clearSession(): void {
		this._session = {
			id: generateUuid(),
			messages: [],
			createdAt: Date.now(),
		};
		this._onDidChangeSession.fire(this._session);
	}
}
