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
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as { type?: unknown };
	return typeof candidate.type === 'string';
}
