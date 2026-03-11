/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

const missionControlEditorIcon = registerIcon('soa-mission-control-editor-icon', Codicon.project, localize('soaMissionControlEditorIcon', 'Icon for the Mission Control editor tab.'));

export class MissionControlEditorInput extends EditorInput {

	static readonly ID = 'workbench.soaMissionControl.input';

	private static readonly RESOURCE = URI.from({ scheme: 'soa', path: '/mission-control' });

	override get typeId(): string {
		return MissionControlEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	override get resource(): URI {
		return MissionControlEditorInput.RESOURCE;
	}

	override getName(): string {
		return localize('missionControl.editorName', "Mission Control");
	}

	override getIcon(): ThemeIcon | undefined {
		return missionControlEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof MissionControlEditorInput;
	}
}
