/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DiagramadorPersistedClientState = {
	lastViewMode: 'list' | 'task';
};

export function normalizePersistedClientState(value: unknown): DiagramadorPersistedClientState {
	const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	return {
		lastViewMode: raw.lastViewMode === 'task' ? 'task' : 'list'
	};
}

export function buildPersistedClientState(lastViewMode: 'list' | 'task'): DiagramadorPersistedClientState {
	return { lastViewMode };
}

function createHelpersBootstrapSource(): string {
	return [
		normalizePersistedClientState.toString(),
		buildPersistedClientState.toString()
	].join('\n');
}

export function getDiagramadorClientScript(initialStateJson: string): string {
	const helpers = createHelpersBootstrapSource();
	return `
${helpers}
const vscode = (typeof acquireVsCodeApi === 'function')
	? acquireVsCodeApi()
	: { postMessage: () => { }, getState: () => undefined, setState: () => { } };

let state = normalizeState(${initialStateJson});
let persistedClientState = normalizePersistedClientState(vscode.getState());
const FIELD_UPDATE_DEBOUNCE_MS = 400;
const pendingFieldUpdates = new Map();
const createTaskDraftDefaults = {
	label: '',
	taskType: 'teorica',
	templateId: 'tarefa'
};
let createTaskModalState = {
	open: false,
	submitting: false,
	draft: { ...createTaskDraftDefaults },
	errors: {}
};

const statusEl = document.getElementById('status');
const buildErrorEl = document.getElementById('buildError');
const buildErrorDetailEl = document.getElementById('buildErrorDetail');
const buildLogButton = document.getElementById('buildLogButton');
const buildRetryButton = document.getElementById('buildRetryButton');
const buildFolderButton = document.getElementById('buildFolderButton');
const buildDetailsPanel = document.getElementById('buildDetailsPanel');
const buildDetailsList = document.getElementById('buildDetailsList');
const runtimeSummaryValue = document.getElementById('runtimeSummaryValue');
const runtimeReasonValue = document.getElementById('runtimeReasonValue');
const runtimeRequestedValue = document.getElementById('runtimeRequestedValue');
const listView = document.getElementById('listView');
const taskView = document.getElementById('taskView');
const tasksList = document.getElementById('tasksList');
const tasksHint = document.getElementById('tasksHint');
const newTaskButton = document.getElementById('newTaskButton');
const backToListButton = document.getElementById('backToListButton');
const taskTitle = document.getElementById('taskTitle');
const taskTemplateValue = document.getElementById('taskTemplateValue');
const taskNameInput = document.getElementById('taskNameInput');
const taskTypeSelect = document.getElementById('taskTypeSelect');
const fieldsContainer = document.getElementById('fieldsContainer');
const fieldsHint = document.getElementById('fieldsHint');
const createTaskModal = document.getElementById('createTaskModal');
const createTaskForm = document.getElementById('createTaskForm');
const createTaskNameInput = document.getElementById('createTaskNameInput');
const createTaskCancelButton = document.getElementById('createTaskCancelButton');
const createTaskSubmitButton = document.getElementById('createTaskSubmitButton');
const createTaskGeneralError = document.getElementById('createTaskGeneralError');
const createTaskNameError = document.getElementById('createTaskNameError');
const createTaskTypeError = document.getElementById('createTaskTypeError');
const createTaskTemplateError = document.getElementById('createTaskTemplateError');
const createTaskTypeCards = Array.from(document.querySelectorAll('[data-task-type]'));
const createTaskTemplateCards = Array.from(document.querySelectorAll('[data-template-id]'));
const createTaskPreviewLabel = document.getElementById('createTaskPreviewLabel');
const createTaskPreviewType = document.getElementById('createTaskPreviewType');
const createTaskPreviewTemplate = document.getElementById('createTaskPreviewTemplate');

function normalizeState(next) {
	const base = next && typeof next === 'object' ? next : {};
	const buildDetails = base.buildDetails && typeof base.buildDetails === 'object' ? base.buildDetails : {};
	const preview = base.preview && typeof base.preview === 'object' ? base.preview : {};
	const runtimeInfo = base.runtimeInfo && typeof base.runtimeInfo === 'object' ? base.runtimeInfo : {};
	const normalizeTechItems = (value) => Array.isArray(value)
		? value
			.map(entry => entry && typeof entry === 'object' ? entry : {})
			.filter(entry => typeof entry.label === 'string' && typeof entry.value === 'string')
		: [];
	return {
		viewMode: base.viewMode === 'task' ? 'task' : 'list',
		schema: Array.isArray(base.schema) ? base.schema : [],
		data: base.data && typeof base.data === 'object' ? base.data : {},
		status: base.status && typeof base.status === 'object' ? base.status : { state: 'idle' },
		buildError: typeof base.buildError === 'string' ? base.buildError : '',
		buildLogPath: typeof base.buildLogPath === 'string' ? base.buildLogPath : '',
		buildOutDir: typeof base.buildOutDir === 'string' ? base.buildOutDir : '',
		buildDetails: {
			failureCode: typeof buildDetails.failureCode === 'string' ? buildDetails.failureCode : '',
			detail: typeof buildDetails.detail === 'string' ? buildDetails.detail : '',
			technicalDetails: normalizeTechItems(buildDetails.technicalDetails)
		},
		preview: {
			state: typeof preview.state === 'string' ? preview.state : 'idle',
			modeUsed: typeof preview.modeUsed === 'string' ? preview.modeUsed : '',
			reasonCode: typeof preview.reasonCode === 'string' ? preview.reasonCode : '',
			message: typeof preview.message === 'string' ? preview.message : '',
			details: Array.isArray(preview.details) ? preview.details.filter(entry => typeof entry === 'string') : [],
			path: typeof preview.path === 'string' ? preview.path : ''
		},
		tasks: Array.isArray(base.tasks) ? base.tasks : [],
		currentTaskId: typeof base.currentTaskId === 'string' ? base.currentTaskId : '',
		currentTaskLabel: typeof base.currentTaskLabel === 'string' ? base.currentTaskLabel : '',
		currentTaskType: typeof base.currentTaskType === 'string' ? base.currentTaskType : 'teorica',
		currentTemplateId: typeof base.currentTemplateId === 'string' ? base.currentTemplateId : '',
		currentTemplateName: typeof base.currentTemplateName === 'string' ? base.currentTemplateName : '',
		runtimeInfo: {
			baseDir: typeof runtimeInfo.baseDir === 'string' ? runtimeInfo.baseDir : '',
			outDir: typeof runtimeInfo.outDir === 'string' ? runtimeInfo.outDir : '',
			relocated: Boolean(runtimeInfo.relocated),
			reason: typeof runtimeInfo.reason === 'string' ? runtimeInfo.reason : '',
			requestedBaseDir: typeof runtimeInfo.requestedBaseDir === 'string' ? runtimeInfo.requestedBaseDir : ''
		}
	};
}

function persistClientState() {
	const next = buildPersistedClientState(state.viewMode === 'task' ? 'task' : 'list');
	persistedClientState = normalizePersistedClientState(next);
	vscode.setState(next);
}

function renderStatus() {
	if (!statusEl) {
		return;
	}
	const previewMessage = state.preview?.message || '';
	const buildMessage = typeof state.status?.message === 'string' ? state.status.message : '';
	const fallback = state.viewMode === 'task' ? 'Tarefa pronta para edicao.' : 'Selecione ou crie uma tarefa.';
	const message = state.buildError || previewMessage || buildMessage || fallback;
	statusEl.dataset.state = state.status?.state || 'idle';
	statusEl.textContent = message;
}

function collectTechnicalDetails() {
	const items = [];
	const preview = state.preview || {};
	const buildDetails = state.buildDetails || {};
	if (buildDetails.failureCode) {
		items.push({ label: 'failureCode', value: buildDetails.failureCode });
	}
	if (preview.modeUsed) {
		items.push({ label: 'previewMode', value: preview.modeUsed });
	}
	if (preview.reasonCode) {
		items.push({ label: 'previewReason', value: preview.reasonCode });
	}
	if (preview.path) {
		items.push({ label: 'previewPath', value: preview.path });
	}
	if (state.runtimeInfo?.baseDir) {
		items.push({ label: 'runtimeBaseDir', value: state.runtimeInfo.baseDir });
	}
	if (state.runtimeInfo?.requestedBaseDir) {
		items.push({ label: 'runtimeRequestedDir', value: state.runtimeInfo.requestedBaseDir });
	}
	if (state.runtimeInfo?.reason) {
		items.push({ label: 'runtimeReason', value: state.runtimeInfo.reason });
	}
	if (Array.isArray(buildDetails.technicalDetails)) {
		for (const item of buildDetails.technicalDetails) {
			items.push(item);
		}
	}
	return items;
}

function renderBuildError() {
	const hasError = Boolean(state.buildError);
	if (buildErrorEl) {
		buildErrorEl.textContent = state.buildError || '';
		buildErrorEl.classList.toggle('hidden', !hasError);
	}
	if (buildErrorDetailEl) {
		const details = [];
		if (state.buildDetails?.detail) {
			details.push(state.buildDetails.detail);
		}
		if (state.runtimeInfo?.reason) {
			details.push(state.runtimeInfo.reason);
		}
		if (Array.isArray(state.preview?.details)) {
			details.push(...state.preview.details);
		}
		buildErrorDetailEl.textContent = details.join('\\n\\n');
		buildErrorDetailEl.classList.toggle('hidden', details.length === 0);
	}
	const techItems = collectTechnicalDetails();
	if (buildDetailsPanel) {
		buildDetailsPanel.classList.toggle('hidden', techItems.length === 0);
	}
	if (buildDetailsList) {
		buildDetailsList.innerHTML = '';
		for (const item of techItems) {
			const row = document.createElement('div');
			row.className = 'detail-row';
			const label = document.createElement('span');
			label.className = 'detail-label';
			label.textContent = item.label;
			const value = document.createElement('code');
			value.className = 'detail-value';
			value.textContent = item.value;
			row.appendChild(label);
			row.appendChild(value);
			buildDetailsList.appendChild(row);
		}
	}
	if (runtimeSummaryValue) {
		runtimeSummaryValue.textContent = state.runtimeInfo?.outDir || state.buildOutDir || 'Runtime ainda nao resolvido.';
	}
	if (runtimeReasonValue) {
		runtimeReasonValue.textContent = state.runtimeInfo?.reason || 'Sem realocacao automatica.';
	}
	if (runtimeRequestedValue) {
		runtimeRequestedValue.textContent = state.runtimeInfo?.requestedBaseDir || state.runtimeInfo?.baseDir || '-';
	}
}

function renderBuildActions() {
	if (buildLogButton) {
		buildLogButton.disabled = !state.buildLogPath;
	}
	if (buildFolderButton) {
		buildFolderButton.disabled = !state.buildOutDir && !state.runtimeInfo?.outDir;
	}
	if (buildRetryButton) {
		buildRetryButton.disabled = !state.currentTaskId;
	}
}

function renderViewMode() {
	const isTask = state.viewMode === 'task' && Boolean(state.currentTaskId);
	if (listView) {
		listView.classList.toggle('hidden', isTask);
	}
	if (taskView) {
		taskView.classList.toggle('hidden', !isTask);
	}
}

function createTaskActionButton(label, action, taskId, taskLabel) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'secondary-button';
	button.textContent = label;
	button.dataset.action = action;
	button.dataset.taskId = taskId;
	if (taskLabel) {
		button.dataset.taskLabel = taskLabel;
	}
	return button;
}

function renderTasks() {
	if (!tasksList || !tasksHint) {
		return;
	}
	tasksList.innerHTML = '';
	if (!state.tasks.length) {
		tasksHint.textContent = 'Nenhuma tarefa criada ainda.';
		tasksHint.classList.remove('hidden');
		return;
	}
	tasksHint.classList.add('hidden');
	for (const task of state.tasks) {
		const item = document.createElement('article');
		item.className = 'task-item';
		const header = document.createElement('div');
		header.className = 'task-copy';
		const title = document.createElement('h3');
		title.textContent = task.label || task.id;
		const meta = document.createElement('p');
		meta.className = 'task-meta';
		const parts = [];
		if (typeof task.taskType === 'string' && task.taskType) {
			parts.push(task.taskType);
		}
		if (typeof task.templateId === 'string' && task.templateId) {
			parts.push('template: ' + task.templateId);
		}
		meta.textContent = parts.join(' · ');
		header.appendChild(title);
		header.appendChild(meta);
		const actions = document.createElement('div');
		actions.className = 'actions';
		actions.appendChild(createTaskActionButton('Abrir', 'open', task.id, task.label));
		actions.appendChild(createTaskActionButton('Renomear', 'rename', task.id, task.label));
		actions.appendChild(createTaskActionButton('Excluir', 'delete', task.id, task.label));
		item.appendChild(header);
		item.appendChild(actions);
		tasksList.appendChild(item);
	}
}

function renderTaskMeta() {
	if (taskTitle) {
		taskTitle.textContent = state.currentTaskLabel || 'Tarefa';
	}
	if (taskTemplateValue) {
		taskTemplateValue.textContent = state.currentTemplateName || state.currentTemplateId || '-';
	}
	if (taskNameInput) {
		taskNameInput.value = state.currentTaskLabel || '';
		taskNameInput.disabled = !state.currentTaskId;
	}
	if (taskTypeSelect) {
		taskTypeSelect.value = state.currentTaskType || 'teorica';
		taskTypeSelect.disabled = !state.currentTaskId;
	}
	if (backToListButton) {
		backToListButton.disabled = !state.currentTaskId;
	}
}

function readFieldValue(field, element) {
	switch (field.type) {
		case 'boolean':
			return Boolean(element.checked);
		case 'number':
			return element.value;
		case 'string[]':
			return String(element.value || '')
				.split(/\\r?\\n/)
				.map(line => line.trim())
				.filter(Boolean);
		default:
			return element.value;
	}
}

function sendFieldUpdate(key, value) {
	vscode.postMessage({ type: 'updateField', key, value });
}

function queueFieldUpdate(key, value) {
	const existing = pendingFieldUpdates.get(key);
	if (existing?.timer) {
		clearTimeout(existing.timer);
	}
	const timer = window.setTimeout(() => {
		pendingFieldUpdates.delete(key);
		sendFieldUpdate(key, value);
	}, FIELD_UPDATE_DEBOUNCE_MS);
	pendingFieldUpdates.set(key, { timer, value });
}

function flushFieldUpdate(key) {
	const existing = pendingFieldUpdates.get(key);
	if (!existing) {
		return;
	}
	clearTimeout(existing.timer);
	pendingFieldUpdates.delete(key);
	sendFieldUpdate(key, existing.value);
}

function clearPendingFieldUpdates() {
	for (const entry of pendingFieldUpdates.values()) {
		clearTimeout(entry.timer);
	}
	pendingFieldUpdates.clear();
}

function createFieldControl(field, value) {
	let control;
	switch (field.type) {
		case 'latex': {
			control = document.createElement('textarea');
			control.className = 'field-textarea code-input';
			control.value = typeof value === 'string' ? value : '';
			break;
		}
		case 'string[]': {
			control = document.createElement('textarea');
			control.className = 'field-textarea';
			control.value = Array.isArray(value) ? value.join('\\n') : '';
			break;
		}
		case 'number': {
			control = document.createElement('input');
			control.type = 'number';
			control.className = 'field-input';
			control.value = value === null || value === undefined ? '' : String(value);
			break;
		}
		case 'boolean': {
			control = document.createElement('input');
			control.type = 'checkbox';
			control.className = 'field-checkbox';
			control.checked = Boolean(value);
			break;
		}
		case 'string':
		default: {
			control = document.createElement('input');
			control.type = 'text';
			control.className = 'field-input';
			control.value = typeof value === 'string' ? value : '';
			break;
		}
	}
	control.dataset.fieldKey = field.key;
	control.dataset.fieldType = field.type;
	const emitUpdate = () => queueFieldUpdate(field.key, readFieldValue(field, control));
	const flushUpdate = () => flushFieldUpdate(field.key);
	if (field.type === 'boolean') {
		control.addEventListener('change', emitUpdate);
	} else {
		control.addEventListener('input', emitUpdate);
		control.addEventListener('blur', flushUpdate);
	}
	return control;
}

function renderFields() {
	if (!fieldsContainer || !fieldsHint) {
		return;
	}
	fieldsContainer.innerHTML = '';
	const isTask = state.viewMode === 'task' && Boolean(state.currentTaskId);
	if (!isTask) {
		fieldsHint.textContent = 'Abra uma tarefa para editar os campos do documento.';
		fieldsHint.classList.remove('hidden');
		return;
	}
	if (!state.schema.length) {
		fieldsHint.textContent = 'Este template nao possui campos editaveis.';
		fieldsHint.classList.remove('hidden');
		return;
	}
	fieldsHint.classList.add('hidden');
	for (const field of state.schema) {
		const wrapper = document.createElement('label');
		wrapper.className = 'field-card';
		const label = document.createElement('span');
		label.className = 'field-label';
		label.textContent = field.label || field.key;
		const value = Object.prototype.hasOwnProperty.call(state.data, field.key) ? state.data[field.key] : '';
		const control = createFieldControl(field, value);
		wrapper.appendChild(label);
		wrapper.appendChild(control);
		fieldsContainer.appendChild(wrapper);
	}
}

function resetCreateTaskDraft() {
	createTaskModalState = {
		open: false,
		submitting: false,
		draft: { ...createTaskDraftDefaults },
		errors: {}
	};
}

function openCreateTaskModal() {
	createTaskModalState.open = true;
	createTaskModalState.submitting = false;
	createTaskModalState.errors = {};
	renderCreateTaskModal();
	window.setTimeout(() => {
		createTaskNameInput?.focus();
		createTaskNameInput?.select();
	}, 0);
}

function closeCreateTaskModal() {
	resetCreateTaskDraft();
	renderCreateTaskModal();
}

function updateCreateTaskDraft(patch) {
	createTaskModalState.draft = {
		...createTaskModalState.draft,
		...patch
	};
	renderCreateTaskModal();
}

function renderCreateTaskOptionCards(cards, selectedKey, selectedValue) {
	for (const card of cards) {
		const isSelected = card.dataset[selectedKey] === selectedValue;
		card.classList.toggle('option-card-selected', isSelected);
		card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
	}
}

function renderCreateTaskModal() {
	if (!createTaskModal) {
		return;
	}
	createTaskModal.classList.toggle('hidden', !createTaskModalState.open);
	createTaskModal.setAttribute('aria-hidden', createTaskModalState.open ? 'false' : 'true');
	document.body.classList.toggle('modal-open', createTaskModalState.open);
	if (createTaskNameInput) {
		createTaskNameInput.value = createTaskModalState.draft.label;
		createTaskNameInput.disabled = createTaskModalState.submitting;
	}
	renderCreateTaskOptionCards(createTaskTypeCards, 'taskType', createTaskModalState.draft.taskType);
	renderCreateTaskOptionCards(createTaskTemplateCards, 'templateId', createTaskModalState.draft.templateId);
	if (createTaskSubmitButton) {
		createTaskSubmitButton.disabled = createTaskModalState.submitting;
		createTaskSubmitButton.textContent = createTaskModalState.submitting ? 'Criando...' : 'Criar e abrir';
	}
	if (createTaskCancelButton) {
		createTaskCancelButton.disabled = createTaskModalState.submitting;
	}
	if (createTaskNameError) {
		createTaskNameError.textContent = createTaskModalState.errors.label || '';
		createTaskNameError.classList.toggle('hidden', !createTaskModalState.errors.label);
	}
	if (createTaskTypeError) {
		createTaskTypeError.textContent = createTaskModalState.errors.taskType || '';
		createTaskTypeError.classList.toggle('hidden', !createTaskModalState.errors.taskType);
	}
	if (createTaskTemplateError) {
		createTaskTemplateError.textContent = createTaskModalState.errors.templateId || '';
		createTaskTemplateError.classList.toggle('hidden', !createTaskModalState.errors.templateId);
	}
	if (createTaskGeneralError) {
		createTaskGeneralError.textContent = createTaskModalState.errors.general || '';
		createTaskGeneralError.classList.toggle('hidden', !createTaskModalState.errors.general);
	}
	if (createTaskPreviewLabel) {
		createTaskPreviewLabel.textContent = createTaskModalState.draft.label.trim() || 'Nova tarefa';
	}
	if (createTaskPreviewType) {
		createTaskPreviewType.textContent = createTaskModalState.draft.taskType;
	}
	if (createTaskPreviewTemplate) {
		createTaskPreviewTemplate.textContent = createTaskModalState.draft.templateId;
	}
}

function submitCreateTask() {
	const label = (createTaskNameInput?.value || createTaskModalState.draft.label || '').trim();
	createTaskModalState.draft.label = label;
	createTaskModalState.errors = {};
	createTaskModalState.submitting = true;
	renderCreateTaskModal();
	vscode.postMessage({
		type: 'createTask',
		label,
		taskType: createTaskModalState.draft.taskType,
		templateId: createTaskModalState.draft.templateId
	});
}

function handleCreateTaskValidation(errors) {
	createTaskModalState.open = true;
	createTaskModalState.submitting = false;
	createTaskModalState.errors = errors && typeof errors === 'object' ? errors : {};
	renderCreateTaskModal();
}

function renderAll() {
	renderStatus();
	renderBuildError();
	renderBuildActions();
	renderViewMode();
	renderTasks();
	renderTaskMeta();
	renderFields();
	renderCreateTaskModal();
	persistClientState();
}

function bindCommonControls() {
	if (newTaskButton) {
		newTaskButton.addEventListener('click', () => {
			openCreateTaskModal();
		});
	}
	if (buildLogButton) {
		buildLogButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'openBuildLog', scope: 'document' });
		});
	}
	if (buildRetryButton) {
		buildRetryButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'retryBuild', scope: 'document' });
		});
	}
	if (buildFolderButton) {
		buildFolderButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'openBuildFolder', scope: 'document' });
		});
	}
	if (createTaskForm) {
		createTaskForm.addEventListener('submit', (event) => {
			event.preventDefault();
			submitCreateTask();
		});
	}
	if (createTaskCancelButton) {
		createTaskCancelButton.addEventListener('click', () => {
			closeCreateTaskModal();
		});
	}
	if (createTaskNameInput) {
		createTaskNameInput.addEventListener('input', () => {
			updateCreateTaskDraft({
				label: createTaskNameInput.value
			});
		});
	}
	for (const card of createTaskTypeCards) {
		card.addEventListener('click', () => {
			updateCreateTaskDraft({ taskType: card.dataset.taskType || 'teorica' });
		});
	}
	for (const card of createTaskTemplateCards) {
		card.addEventListener('click', () => {
			updateCreateTaskDraft({ templateId: card.dataset.templateId || 'tarefa' });
		});
	}
	document.addEventListener('keydown', (event) => {
		if (!createTaskModalState.open) {
			return;
		}
		if (event.key === 'Escape' && !createTaskModalState.submitting) {
			event.preventDefault();
			closeCreateTaskModal();
		}
		if (event.key === 'Enter' && event.target === createTaskNameInput && !event.shiftKey) {
			event.preventDefault();
			submitCreateTask();
		}
	});
}

function bindListView() {
	if (!tasksList) {
		return;
	}
	tasksList.addEventListener('click', (event) => {
		const target = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
		if (!target) {
			return;
		}
		const taskId = target.dataset.taskId || '';
		const taskLabel = target.dataset.taskLabel || '';
		switch (target.dataset.action) {
			case 'open':
				clearPendingFieldUpdates();
				vscode.postMessage({ type: 'openTask', taskId });
				break;
			case 'rename':
				vscode.postMessage({ type: 'renameTask', taskId, label: taskLabel });
				break;
			case 'delete':
				vscode.postMessage({ type: 'deleteTask', taskId });
				break;
		}
	});
}

function bindTaskView() {
	if (backToListButton) {
		backToListButton.addEventListener('click', () => {
			clearPendingFieldUpdates();
			vscode.postMessage({ type: 'backToList' });
		});
	}
	if (taskNameInput) {
		taskNameInput.addEventListener('input', () => {
			queueFieldUpdate('TaskLabel', taskNameInput.value);
		});
		taskNameInput.addEventListener('blur', () => {
			flushFieldUpdate('TaskLabel');
		});
	}
	if (taskTypeSelect) {
		taskTypeSelect.addEventListener('change', () => {
			queueFieldUpdate('TaskType', taskTypeSelect.value);
			flushFieldUpdate('TaskType');
		});
	}
}

function boot() {
	bindCommonControls();
	bindListView();
	bindTaskView();
	window.addEventListener('message', (event) => {
		const payload = event.data;
		if (!payload || typeof payload !== 'object') {
			return;
		}
		if (payload.type === 'state') {
			const previousTaskId = state.currentTaskId;
			state = normalizeState(payload.state);
			if (previousTaskId && previousTaskId !== state.currentTaskId) {
				clearPendingFieldUpdates();
			}
			if (createTaskModalState.open && state.viewMode === 'task' && state.currentTaskId) {
				closeCreateTaskModal();
			}
			renderAll();
			return;
		}
		if (payload.type === 'createTaskValidation') {
			handleCreateTaskValidation(payload.errors);
		}
	});
	renderAll();
	vscode.postMessage({ type: 'ready' });
}

boot();
`;
}
