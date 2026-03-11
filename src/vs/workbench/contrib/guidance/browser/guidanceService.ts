/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	GuidanceCategory,
	IAgentRole,
	IGuidanceItem,
	IWorkflowDefinition,
	BUILT_IN_AGENT_ROLES,
	BUILT_IN_RULES,
	BUILT_IN_SKILLS,
	BUILT_IN_WORKFLOWS,
} from '../common/guidanceTypes.js';

// --- Service interface ---

export const IGuidanceService = createDecorator<IGuidanceService>('soaGuidanceService');

export interface IGuidanceService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeGuidance: Event<void>;

	getAllItems(): readonly IGuidanceItem[];
	getItemsByCategory(category: GuidanceCategory): readonly IGuidanceItem[];
	searchItems(query: string): readonly IGuidanceItem[];
	getWorkflows(): readonly IWorkflowDefinition[];
	getWorkflowById(id: string): IWorkflowDefinition | undefined;
	getRules(): readonly IGuidanceItem[];
	getSkills(): readonly IGuidanceItem[];
	getAgentRoles(): readonly IAgentRole[];
}

// --- Service implementation ---

export class GuidanceService extends Disposable implements IGuidanceService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeGuidance = this._register(new Emitter<void>());
	readonly onDidChangeGuidance: Event<void> = this._onDidChangeGuidance.event;

	private readonly _workflows: IWorkflowDefinition[];
	private readonly _rules: IGuidanceItem[];
	private readonly _skills: IGuidanceItem[];
	private readonly _agentRoles: IAgentRole[];

	constructor() {
		super();
		this._workflows = [...BUILT_IN_WORKFLOWS];
		this._rules = [...BUILT_IN_RULES];
		this._skills = [...BUILT_IN_SKILLS];
		this._agentRoles = [...BUILT_IN_AGENT_ROLES];
	}

	// --- Query methods ---

	getAllItems(): readonly IGuidanceItem[] {
		return [...this._rules, ...this._skills];
	}

	getItemsByCategory(category: GuidanceCategory): readonly IGuidanceItem[] {
		return this.getAllItems().filter(item => item.category === category);
	}

	searchItems(query: string): readonly IGuidanceItem[] {
		if (!query.trim()) {
			return this.getAllItems();
		}

		const q = query.toLowerCase();

		return this.getAllItems().filter(item => {
			if (item.title.toLowerCase().includes(q)) {
				return true;
			}
			if (item.description.toLowerCase().includes(q)) {
				return true;
			}
			if (item.content.toLowerCase().includes(q)) {
				return true;
			}
			if (item.tags.some(tag => tag.toLowerCase().includes(q))) {
				return true;
			}
			return false;
		});
	}

	getWorkflows(): readonly IWorkflowDefinition[] {
		return this._workflows;
	}

	getWorkflowById(id: string): IWorkflowDefinition | undefined {
		return this._workflows.find(w => w.id === id);
	}

	getRules(): readonly IGuidanceItem[] {
		return this._rules;
	}

	getSkills(): readonly IGuidanceItem[] {
		return this._skills;
	}

	getAgentRoles(): readonly IAgentRole[] {
		return this._agentRoles;
	}
}
