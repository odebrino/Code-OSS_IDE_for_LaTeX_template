/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type CorrecaoReadyMessage = {
	type: 'ready';
};

export type CorrecaoSelectTaskMessage = {
	type: 'selectTask';
	taskId: string;
};

export type CorrecaoRefreshTasksMessage = {
	type: 'refreshTasks';
};

export type CorrecaoSelectFieldMessage = {
	type: 'selectField';
	key: string;
};

export type CorrecaoSelectRevisionMessage = {
	type: 'selectRevision';
	revisionId: string;
};

export type CorrecaoNewRevisionMessage = {
	type: 'newRevision';
};

export type CorrecaoAddSuggestionMessage = {
	type: 'addSuggestion';
	opType: 'replace' | 'insert' | 'comment';
	text: string;
	start?: number;
	end?: number;
	at?: number;
};

export type CorrecaoUpdateSuggestionMessage = {
	type: 'acceptSuggestion' | 'rejectSuggestion';
	revisionId: string;
	index: number;
};

export type CorrecaoOpenBuildLogMessage = {
	type: 'openBuildLog';
};

export type CorrecaoOpenBuildFolderMessage = {
	type: 'openBuildFolder';
};

export type CorrecaoRetryBuildMessage = {
	type: 'retryBuild';
};

export type CorrecaoWebviewMessage =
	| CorrecaoReadyMessage
	| CorrecaoSelectTaskMessage
	| CorrecaoRefreshTasksMessage
	| CorrecaoSelectFieldMessage
	| CorrecaoSelectRevisionMessage
	| CorrecaoNewRevisionMessage
	| CorrecaoAddSuggestionMessage
	| CorrecaoUpdateSuggestionMessage
	| CorrecaoOpenBuildLogMessage
	| CorrecaoOpenBuildFolderMessage
	| CorrecaoRetryBuildMessage;

export function isCorrecaoWebviewMessage(value: unknown): value is CorrecaoWebviewMessage {
	if (!isPlainObject(value) || typeof value.type !== 'string') {
		return false;
	}
	switch (value.type) {
		case 'ready':
		case 'refreshTasks':
		case 'newRevision':
		case 'openBuildLog':
		case 'openBuildFolder':
		case 'retryBuild':
			return true;
		case 'selectTask':
			return typeof value.taskId === 'string';
		case 'selectField':
			return typeof value.key === 'string';
		case 'selectRevision':
			return typeof value.revisionId === 'string';
		case 'acceptSuggestion':
		case 'rejectSuggestion':
			return typeof value.revisionId === 'string' && Number.isInteger(value.index) && Number(value.index) >= 0;
		case 'addSuggestion':
			return isValidAddSuggestionMessage(value);
		default:
			return false;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidAddSuggestionMessage(value: Record<string, unknown>): value is CorrecaoAddSuggestionMessage {
	if ((value.opType !== 'replace' && value.opType !== 'insert' && value.opType !== 'comment') || typeof value.text !== 'string') {
		return false;
	}
	if (value.opType === 'insert') {
		return Number.isInteger(value.at) && Number(value.at) >= 0;
	}
	return Number.isInteger(value.start)
		&& Number.isInteger(value.end)
		&& Number(value.start) >= 0
		&& Number(value.end) >= 0;
}
