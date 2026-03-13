/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BuildFailureCode, TemplateFieldSchema } from 'co-template-core';
import type { PdfPreviewState, PreviewReasonCode, PreviewRenderMode } from 'co-preview-core';
import type { DiagramadorTaskType } from './diagramador';

export type DiagramadorFieldValue = string | number | boolean | string[] | null;

export type DiagramadorStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
};

export type DiagramadorBuildDetails = {
	failureCode?: BuildFailureCode;
	detail?: string;
	technicalDetails: Array<{ label: string; value: string }>;
};

export type DiagramadorPreviewInfo = {
	state: PdfPreviewState;
	modeUsed?: PreviewRenderMode;
	reasonCode?: PreviewReasonCode;
	message?: string;
	details?: string[];
	path?: string;
};

export type DiagramadorRuntimeInfo = {
	baseDir: string;
	outDir: string;
	relocated: boolean;
	reason?: string;
	requestedBaseDir?: string;
};

export type DiagramadorTemplateSummary = {
	id: string;
	name: string;
	version?: string;
	description?: string;
};

export type DiagramadorTaskSummary = {
	id: string;
	label: string;
	updatedAt: number;
	taskType?: DiagramadorTaskType;
	templateId?: string;
};

export type DiagramadorTemplateEditorState = {
	selectedTemplateId: string;
	template?: {
		manifest: {
			id: string;
			name: string;
			version: string;
			description: string;
			entry: string;
			schema: TemplateFieldSchema[];
			defaults?: Record<string, DiagramadorFieldValue>;
		};
		mainTex: string;
		previewData: Record<string, DiagramadorFieldValue>;
		readOnly: boolean;
		assets: string[];
	};
	status: DiagramadorStatus;
	error?: string;
	buildError?: string;
	buildLogPath?: string;
	buildOutDir?: string;
	buildDetails?: DiagramadorBuildDetails;
	preview?: DiagramadorPreviewInfo;
	revision?: number;
};

export type DiagramadorState = {
	templates: DiagramadorTemplateSummary[];
	selectedTemplateId: string;
	viewMode?: 'list' | 'task';
	schema: TemplateFieldSchema[];
	data: Record<string, DiagramadorFieldValue>;
	status: DiagramadorStatus;
	buildError?: string;
	buildLogPath?: string;
	buildOutDir?: string;
	buildDetails?: DiagramadorBuildDetails;
	preview?: DiagramadorPreviewInfo;
	tasks: DiagramadorTaskSummary[];
	currentTaskId?: string;
	currentTaskLabel?: string;
	currentTaskType?: DiagramadorTaskType;
	currentTemplateId?: string;
	currentTemplateName?: string;
	runtimeInfo?: DiagramadorRuntimeInfo;
	activeTab?: 'document' | 'templates';
	templateEditor?: DiagramadorTemplateEditorState;
};

export type DiagramadorReadyMessage = {
	type: 'ready';
};

export type DiagramadorSetTabMessage = {
	type: 'setTab';
	tab: 'document' | 'templates';
};

export type DiagramadorOpenTaskMessage = {
	type: 'openTask';
	taskId: string;
};

export type DiagramadorCreateTaskMessage = {
	type: 'createTask';
	label?: string;
	taskType?: DiagramadorTaskType;
	templateId?: string;
};

export type DiagramadorBackToListMessage = {
	type: 'backToList';
};

export type DiagramadorRenameTaskMessage = {
	type: 'renameTask';
	taskId: string;
	label?: string;
};

export type DiagramadorDeleteTaskMessage = {
	type: 'deleteTask';
	taskId: string;
};

export type DiagramadorUpdateTemplateMessage = {
	type: 'updateTemplate';
	templateId: string;
};

export type DiagramadorUpdateFieldMessage = {
	type: 'updateField';
	key: string;
	value: DiagramadorFieldValue | undefined;
};

export type DiagramadorTemplateSelectMessage = {
	type: 'templateSelect';
	templateId: string;
};

export type DiagramadorTemplateCreateMessage = {
	type: 'templateCreate';
};

export type DiagramadorTemplateDuplicateMessage = {
	type: 'templateDuplicate';
};

export type DiagramadorTemplateDeleteMessage = {
	type: 'templateDelete';
};

export type DiagramadorTemplateExportMessage = {
	type: 'templateExport';
};

export type DiagramadorTemplateImportMessage = {
	type: 'templateImport';
};

export type DiagramadorTemplateSaveMessage = {
	type: 'templateSave';
	manifestText: string;
	mainTex: string;
	previewText: string;
	previousId?: string;
};

export type DiagramadorTemplateAddAssetMessage = {
	type: 'templateAddAsset';
	name: string;
	contents: string;
};

export type DiagramadorTemplateDeleteAssetMessage = {
	type: 'templateDeleteAsset';
	name: string;
};

export type DiagramadorOpenBuildLogMessage = {
	type: 'openBuildLog';
	scope: 'document' | 'template';
};

export type DiagramadorOpenBuildFolderMessage = {
	type: 'openBuildFolder';
	scope: 'document' | 'template';
};

export type DiagramadorRetryBuildMessage = {
	type: 'retryBuild';
	scope: 'document' | 'template';
};

export type DiagramadorConfirmRequestMessage = {
	type: 'confirmRequest';
	requestId: string;
	message: string;
	title?: string;
	detail?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	severity?: 'warning' | 'info';
};

export type DiagramadorWebviewMessage =
	| DiagramadorReadyMessage
	| DiagramadorSetTabMessage
	| DiagramadorOpenTaskMessage
	| DiagramadorCreateTaskMessage
	| DiagramadorBackToListMessage
	| DiagramadorRenameTaskMessage
	| DiagramadorDeleteTaskMessage
	| DiagramadorUpdateTemplateMessage
	| DiagramadorUpdateFieldMessage
	| DiagramadorTemplateSelectMessage
	| DiagramadorTemplateCreateMessage
	| DiagramadorTemplateDuplicateMessage
	| DiagramadorTemplateDeleteMessage
	| DiagramadorTemplateExportMessage
	| DiagramadorTemplateImportMessage
	| DiagramadorTemplateSaveMessage
	| DiagramadorTemplateAddAssetMessage
	| DiagramadorTemplateDeleteAssetMessage
	| DiagramadorOpenBuildLogMessage
	| DiagramadorOpenBuildFolderMessage
	| DiagramadorRetryBuildMessage
	| DiagramadorConfirmRequestMessage;

export type DiagramadorStateMessage = {
	type: 'state';
	state: DiagramadorState;
};

export type DiagramadorConfirmResultMessage = {
	type: 'confirmResult';
	requestId: string;
	accepted: boolean;
};

export type DiagramadorCreateTaskValidationMessage = {
	type: 'createTaskValidation';
	errors: {
		label?: string;
		taskType?: string;
		templateId?: string;
		general?: string;
	};
};

export type DiagramadorHostMessage =
	| DiagramadorStateMessage
	| DiagramadorConfirmResultMessage
	| DiagramadorCreateTaskValidationMessage;

export function isDiagramadorWebviewMessage(value: unknown): value is DiagramadorWebviewMessage {
	if (!isPlainObject(value) || typeof value.type !== 'string') {
		return false;
	}
	switch (value.type) {
		case 'ready':
		case 'backToList':
		case 'templateCreate':
		case 'templateDuplicate':
		case 'templateDelete':
		case 'templateExport':
		case 'templateImport':
			return true;
		case 'setTab':
			return value.tab === 'document' || value.tab === 'templates';
		case 'openTask':
		case 'deleteTask':
			return typeof value.taskId === 'string';
		case 'updateTemplate':
		case 'templateSelect':
			return typeof value.templateId === 'string';
		case 'templateDeleteAsset':
			return typeof value.name === 'string';
		case 'createTask':
			return isOptionalString(value.label)
				&& isOptionalTaskType(value.taskType)
				&& isOptionalString(value.templateId);
		case 'renameTask':
			return typeof value.taskId === 'string' && isOptionalString(value.label);
		case 'updateField':
			return typeof value.key === 'string' && (!Object.prototype.hasOwnProperty.call(value, 'value') || isDiagramadorFieldValue(value.value));
		case 'templateSave':
			return typeof value.manifestText === 'string'
				&& typeof value.mainTex === 'string'
				&& typeof value.previewText === 'string'
				&& isOptionalString(value.previousId);
		case 'templateAddAsset':
			return typeof value.name === 'string' && typeof value.contents === 'string';
		case 'openBuildLog':
		case 'openBuildFolder':
		case 'retryBuild':
			return value.scope === 'document' || value.scope === 'template';
		case 'confirmRequest':
			return typeof value.requestId === 'string'
				&& typeof value.message === 'string'
				&& isOptionalString(value.title)
				&& isOptionalString(value.detail)
				&& isOptionalString(value.confirmLabel)
				&& isOptionalString(value.cancelLabel)
				&& (value.severity === undefined || value.severity === 'warning' || value.severity === 'info');
		default:
			return false;
	}
}

function isPlainObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === 'string';
}

function isOptionalTaskType(value: unknown): value is DiagramadorTaskType | undefined {
	return value === undefined || value === 'teorica' || value === 'pratica' || value === 'salinha';
}

function isDiagramadorFieldValue(value: unknown): value is DiagramadorFieldValue {
	return value === null
		|| typeof value === 'string'
		|| (typeof value === 'number' && Number.isFinite(value))
		|| typeof value === 'boolean'
		|| (Array.isArray(value) && value.every(item => typeof item === 'string'));
}
