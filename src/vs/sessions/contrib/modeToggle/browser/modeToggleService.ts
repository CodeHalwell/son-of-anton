/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export const enum SoaInterfaceMode {
	Editor = 'editor',
	MissionControl = 'missionControl'
}

export const IModeToggleService = createDecorator<IModeToggleService>('soaModeToggleService');

export interface IModeToggleService {
	readonly _serviceBrand: undefined;

	/** The currently active interface mode. */
	readonly currentMode: SoaInterfaceMode;

	/** Fires when the interface mode changes. */
	readonly onDidChangeMode: Event<SoaInterfaceMode>;

	/** Toggle between Editor and Mission Control modes. */
	toggle(): void;

	/** Set the interface mode explicitly. */
	setMode(mode: SoaInterfaceMode): void;
}

export class ModeToggleService extends Disposable implements IModeToggleService {

	declare readonly _serviceBrand: undefined;

	private _currentMode: SoaInterfaceMode = SoaInterfaceMode.Editor;

	private readonly _onDidChangeMode = this._register(new Emitter<SoaInterfaceMode>());
	readonly onDidChangeMode: Event<SoaInterfaceMode> = this._onDidChangeMode.event;

	get currentMode(): SoaInterfaceMode {
		return this._currentMode;
	}

	toggle(): void {
		const next = this._currentMode === SoaInterfaceMode.Editor
			? SoaInterfaceMode.MissionControl
			: SoaInterfaceMode.Editor;
		this.setMode(next);
	}

	setMode(mode: SoaInterfaceMode): void {
		if (this._currentMode === mode) {
			return;
		}
		this._currentMode = mode;
		this._onDidChangeMode.fire(mode);
	}
}
