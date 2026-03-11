/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export interface ITitleBarState {
	readonly modelName: string;
	readonly contextUsagePercent: number;
	readonly sessionCostUsd: number;
	readonly activeAgentCount: number;
}

export const ITitleBarStateService = createDecorator<ITitleBarStateService>('soaTitleBarStateService');

export interface ITitleBarStateService {
	readonly _serviceBrand: undefined;
	readonly state: ITitleBarState;
	readonly onDidChangeState: Event<ITitleBarState>;

	updateModel(modelName: string): void;
	updateContextUsage(percent: number): void;
	addCost(amountUsd: number): void;
	updateActiveAgentCount(count: number): void;
	resetSession(): void;
}

const defaultState: ITitleBarState = {
	modelName: '',
	contextUsagePercent: 0,
	sessionCostUsd: 0,
	activeAgentCount: 0,
};

export class TitleBarStateService extends Disposable implements ITitleBarStateService {

	declare readonly _serviceBrand: undefined;

	private _state: ITitleBarState = { ...defaultState };

	private readonly _onDidChangeState = this._register(new Emitter<ITitleBarState>());
	readonly onDidChangeState: Event<ITitleBarState> = this._onDidChangeState.event;

	get state(): ITitleBarState {
		return this._state;
	}

	updateModel(modelName: string): void {
		if (this._state.modelName === modelName) {
			return;
		}
		this._state = { ...this._state, modelName };
		this._fireStateChange();
	}

	updateContextUsage(percent: number): void {
		const clamped = Math.max(0, Math.min(100, percent));
		if (this._state.contextUsagePercent === clamped) {
			return;
		}
		this._state = { ...this._state, contextUsagePercent: clamped };
		this._fireStateChange();
	}

	addCost(amountUsd: number): void {
		if (amountUsd <= 0) {
			return;
		}
		this._state = { ...this._state, sessionCostUsd: this._state.sessionCostUsd + amountUsd };
		this._fireStateChange();
	}

	updateActiveAgentCount(count: number): void {
		const clamped = Math.max(0, count);
		if (this._state.activeAgentCount === clamped) {
			return;
		}
		this._state = { ...this._state, activeAgentCount: clamped };
		this._fireStateChange();
	}

	resetSession(): void {
		this._state = { ...defaultState };
		this._fireStateChange();
	}

	private _fireStateChange(): void {
		this._onDidChangeState.fire(this._state);
	}
}
