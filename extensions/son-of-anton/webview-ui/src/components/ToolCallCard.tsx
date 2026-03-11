/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, memo } from 'react';
import type { ToolCallInfo } from '../protocol/types';

interface ToolCallCardProps {
	tool: ToolCallInfo;
	onApprove?: (toolId: string) => void;
	onDeny?: (toolId: string) => void;
}

/**
 * Inline tool call visualization with expand/collapse, status indicator,
 * and approve/deny buttons for manual-approval tools.
 */
export const ToolCallCard = memo(function ToolCallCard({ tool, onApprove, onDeny }: ToolCallCardProps) {
	const [expanded, setExpanded] = useState(false);

	const statusIcon = getStatusIcon(tool.status);
	const statusClass = `tool-call-card tool-call-card--${tool.status}`;

	return (
		<div className={statusClass}>
			<div
				className="tool-call-header"
				onClick={() => setExpanded(!expanded)}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => { if (e.key === 'Enter') { setExpanded(!expanded); } }}
			>
				<span className="tool-call-icon">{statusIcon}</span>
				<span className="tool-call-name">{tool.name}</span>
				{tool.latencyMs !== undefined && tool.latencyMs > 0 && (
					<span className="tool-call-latency">{tool.latencyMs}ms</span>
				)}
				<span className="tool-call-chevron">{expanded ? '▾' : '▸'}</span>
			</div>

			{expanded && (
				<div className="tool-call-body">
					<div className="tool-call-section">
						<div className="tool-call-label">Arguments</div>
						<pre className="tool-call-args">{formatJson(tool.args)}</pre>
					</div>

					{tool.result && (
						<div className="tool-call-section">
							<div className="tool-call-label">
								{tool.isError ? 'Error' : 'Result'}
							</div>
							<pre className={`tool-call-result ${tool.isError ? 'tool-call-result--error' : ''}`}>
								{tool.result}
							</pre>
						</div>
					)}
				</div>
			)}

			{tool.status === 'pending' && onApprove && onDeny && (
				<div className="tool-call-actions">
					<button className="tool-call-approve" onClick={() => onApprove(tool.toolId)}>
						Approve
					</button>
					<button className="tool-call-deny" onClick={() => onDeny(tool.toolId)}>
						Deny
					</button>
				</div>
			)}
		</div>
	);
});

function getStatusIcon(status: string): string {
	switch (status) {
		case 'pending': return '⏳';
		case 'running': return '⟳';
		case 'completed': return '✓';
		case 'error': return '✗';
		case 'denied': return '⊘';
		default: return '·';
	}
}

function formatJson(json: string): string {
	try {
		return JSON.stringify(JSON.parse(json), null, 2);
	} catch {
		return json;
	}
}
