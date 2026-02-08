/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';

export type TemplateGeneratorStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
};

export type TemplateGeneratorState = {
	templates: Array<{
		id: string;
		name: string;
		version: string;
		description: string;
		readOnly?: boolean;
	}>;
	template?: {
		manifest: {
			id: string;
			name: string;
			version: string;
			description: string;
			entry: 'main.tex';
			schema: Array<{ key: string; type: string; label: string }>;
			defaults?: Record<string, any>;
		};
		mainTex: string;
		previewData: Record<string, any>;
		readOnly: boolean;
	};
	settings?: {
		autoCompile: boolean;
	};
};

export type MessageHandler = (message: any, webview: vscode.Webview) => void | Promise<void>;

export class TemplateGeneratorViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private readonly uiBuildId: string;
	private lastHtmlBuildId?: string;
	private state: TemplateGeneratorState;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler,
		private readonly getState: () => TemplateGeneratorState,
		uiBuildId: string,
		private readonly onVisible?: () => void
	) {
		this.uiBuildId = uiBuildId;
		this.state = getState();
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};
		this.refreshWebview(true);
		view.webview.onDidReceiveMessage(message => this.onMessage(message, view.webview));
		view.onDidChangeVisibility(() => {
			if (view.visible) {
				this.refreshWebview(true);
				this.onVisible?.();
			}
		});
	}

	sendState(state: TemplateGeneratorState) {
		this.state = state;
		this.view?.webview.postMessage({ type: 'state', state });
	}

	sendStatus(status: TemplateGeneratorStatus) {
		this.view?.webview.postMessage({ type: 'status', status });
	}

	sendError(message: string) {
		this.view?.webview.postMessage({ type: 'error', message });
	}

	show(preserveFocus = true) {
		this.refreshWebview(true);
		this.view?.show(preserveFocus);
	}

	private refreshWebview(force = false) {
		if (!this.view) {
			return;
		}
		if (!force && this.lastHtmlBuildId === this.uiBuildId) {
			return;
		}
		this.state = this.getState();
		this.view.webview.html = getTemplateGeneratorHtml(this.view.webview, this.state, this.uiBuildId);
		this.lastHtmlBuildId = this.uiBuildId;
	}
}

export function registerTemplateGeneratorView(
	context: vscode.ExtensionContext,
	onMessage: MessageHandler,
	getState: () => TemplateGeneratorState,
	onVisible?: () => void
) {
	const provider = new TemplateGeneratorViewProvider(context, onMessage, getState, getUiBuildId(context), onVisible);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('co.templateGenerator.mainView', provider)
	);
	return provider;
}

function getUiBuildId(context: vscode.ExtensionContext): string {
	const version = String(context.extension?.packageJSON?.version ?? '0.0.0');
	if (context.extensionMode === vscode.ExtensionMode.Development) {
		return `${version} / ${new Date().toISOString()}`;
	}
	return version;
}

function getTemplateGeneratorHtml(webview: vscode.Webview, state: TemplateGeneratorState, uiBuildId: string): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`
	].join('; ');
	const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
	const safeBuildId = escapeHtml(uiBuildId);

	return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Gerador de Template</title>
<style>
	:root {
		--bg: linear-gradient(135deg, rgba(217, 119, 6, 0.18), rgba(255, 255, 255, 0) 60%), var(--vscode-sideBar-background, #f7f4ef);
		--card-bg: var(--vscode-editor-background, #ffffff);
		--border: var(--vscode-panel-border, rgba(0, 0, 0, 0.12));
		--text: var(--vscode-foreground, #222222);
		--muted: rgba(60, 60, 60, 0.7);
		--accent: #d97706;
		--accent-strong: #b45309;
	}
	body {
		margin: 0;
		padding: 14px;
		font-family: "Trebuchet MS", "Lucida Sans Unicode", "Lucida Grande", "Segoe UI", sans-serif;
		color: var(--text);
		background: var(--bg);
	}
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.header h1 {
		font-size: 16px;
		margin: 0;
	}
	.badge {
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(217, 119, 6, 0.15);
		border: 1px solid rgba(217, 119, 6, 0.35);
		font-size: 11px;
		color: var(--accent-strong);
		display: none;
	}
	.ui-build {
		font-size: 10px;
		color: var(--muted);
		margin-bottom: 12px;
	}
	.card {
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		margin-bottom: 12px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
	}
	.card h2 {
		margin: 0 0 8px 0;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent-strong);
	}
	label {
		display: block;
		font-size: 11px;
		margin: 8px 0 4px;
		color: var(--muted);
	}
	input, textarea, select {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.9);
		color: inherit;
		font-size: 12px;
	}
	textarea {
		resize: vertical;
		min-height: 120px;
		font-family: "Fira Code", "Courier New", monospace;
	}
	textarea#mainTex {
		min-height: 220px;
	}
	button {
		border: none;
		border-radius: 8px;
		padding: 6px 10px;
		font-size: 12px;
		cursor: pointer;
		background: var(--accent);
		color: #fff;
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}
	button:hover { transform: translateY(-1px); box-shadow: 0 6px 12px rgba(217, 119, 6, 0.25); }
	button.secondary { background: #475569; }
	button.ghost { background: transparent; color: var(--accent-strong); border: 1px solid rgba(217, 119, 6, 0.45); }
	button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; transform: none; }
	.actions {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		margin-top: 8px;
	}
	.compile-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	.toggle-row {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
	}
	.toggle-row input {
		width: auto;
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 120px 1fr auto;
		gap: 6px;
		margin-bottom: 6px;
	}
	.status {
		font-size: 12px;
		margin-top: 6px;
		color: var(--muted);
	}
	.status[data-state="error"] { color: #b91c1c; }
	.status[data-state="success"] { color: var(--accent-strong); }
	.error-line {
		font-size: 11px;
		color: #b91c1c;
		min-height: 14px;
		margin-top: 6px;
	}
	.schema-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
		font-size: 12px;
	}
	.schema-list { margin-top: 8px; }
	.schema-row {
		display: grid;
		grid-template-columns: 1fr 110px 1fr auto;
		gap: 6px;
		margin-bottom: 6px;
	}
	.schema-row button { padding: 4px 8px; }
	.preview-form {
		display: grid;
		gap: 8px;
		margin-bottom: 8px;
	}
	.preview-row {
		display: grid;
		gap: 4px;
	}
	.preview-row.inline {
		grid-template-columns: 1fr auto;
		align-items: center;
	}
	.preview-row label {
		font-size: 11px;
		color: var(--muted);
	}
	.hint {
		font-size: 11px;
		color: var(--muted);
		margin-top: 6px;
	}
</style>
</head>
<body>
	<div class="header">
		<h1>Gerador de Template</h1>
		<div class="badge" id="readOnlyBadge">Somente leitura</div>
	</div>
	<div class="ui-build">UI_BUILD: ${safeBuildId}</div>

	<section class="card">
		<h2>Selecionar Template</h2>
		<label for="templateSelect">Templates</label>
		<select id="templateSelect"></select>
		<div class="actions">
			<button id="newTemplate" type="button">Novo</button>
			<button id="duplicateTemplate" class="secondary" type="button">Duplicar</button>
			<button id="deleteTemplate" class="ghost" type="button">Excluir</button>
			<button id="exportTemplate" class="secondary" type="button">Exportar</button>
		</div>
		<div class="compile-actions">
			<label class="toggle-row">
				<input id="autoCompileToggle" type="checkbox" />
				Auto-compilar
			</label>
			<button id="buildNow" class="secondary" type="button">Gerar PDF</button>
		</div>
		<div class="status" id="buildStatus" data-state="idle"></div>
	</section>

	<section class="card">
		<h2>Metadados</h2>
		<label for="templateName">Nome</label>
		<input id="templateName" type="text" />

		<label for="templateId">ID</label>
		<input id="templateId" type="text" />

		<label for="templateVersion">Versao</label>
		<input id="templateVersion" type="text" />

		<label for="templateDescription">Descricao</label>
		<textarea id="templateDescription"></textarea>
	</section>

	<section class="card">
		<h2>Schema do Template</h2>
		<div class="schema-header">
			<span>Campos</span>
			<button id="addSchema" class="secondary" type="button">Adicionar campo</button>
		</div>
		<div id="schemaList" class="schema-list"></div>
	</section>

	<section class="card">
		<h2>Preview data</h2>
		<div id="previewForm" class="preview-form"></div>
		<label for="previewData">JSON</label>
		<textarea id="previewData"></textarea>
		<div class="hint">JSON usado para gerar o preview.</div>
		<div id="previewError" class="error-line"></div>
	</section>

	<section class="card">
		<h2>LaTeX do Template</h2>
		<textarea id="mainTex"></textarea>
	</section>

	<div id="errorLine" class="error-line"></div>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let state = ${stateJson};
	let idDirty = false;
	let previewDataValid = true;
	let idValid = true;
	let lastTemplateId = state.template ? state.template.manifest.id : '';
	let saveTimer;
	let autoCompile = state.settings ? Boolean(state.settings.autoCompile) : true;

	const templateSelect = document.getElementById('templateSelect');
	const newButton = document.getElementById('newTemplate');
	const duplicateButton = document.getElementById('duplicateTemplate');
	const deleteButton = document.getElementById('deleteTemplate');
	const exportButton = document.getElementById('exportTemplate');
	const statusEl = document.getElementById('buildStatus');
	const readOnlyBadge = document.getElementById('readOnlyBadge');
	const autoCompileToggle = document.getElementById('autoCompileToggle');
	const buildNowButton = document.getElementById('buildNow');
	const nameInput = document.getElementById('templateName');
	const idInput = document.getElementById('templateId');
	const versionInput = document.getElementById('templateVersion');
	const descriptionInput = document.getElementById('templateDescription');
	const schemaList = document.getElementById('schemaList');
	const addSchema = document.getElementById('addSchema');
	const previewForm = document.getElementById('previewForm');
	const previewDataInput = document.getElementById('previewData');
	const previewError = document.getElementById('previewError');
	const mainTexInput = document.getElementById('mainTex');
	const errorLine = document.getElementById('errorLine');

	function setStatus(status) {
		if (!status) {
			statusEl.textContent = '';
			statusEl.dataset.state = 'idle';
			return;
		}
		statusEl.textContent = status.message || '';
		statusEl.dataset.state = status.state || 'idle';
	}

	function setError(message) {
		errorLine.textContent = message || '';
	}

	function setPreviewError(message) {
		previewError.textContent = message || '';
	}

	function setState(next) {
		state = next || { templates: [] };
		const template = state.template;
		if (template) {
			lastTemplateId = template.manifest.id;
			idDirty = false;
			idValid = true;
			setError('');
		}
		autoCompile = state.settings ? Boolean(state.settings.autoCompile) : true;
		render();
	}

	function renderTemplates() {
		templateSelect.innerHTML = '';
		if (!state.templates || !state.templates.length) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Nenhum template encontrado';
			templateSelect.appendChild(option);
			templateSelect.disabled = true;
			return;
		}
		templateSelect.disabled = false;
		state.templates.forEach(template => {
			const option = document.createElement('option');
			option.value = template.id;
			option.textContent = template.name || template.id;
			templateSelect.appendChild(option);
		});
	}

	function renderMetadata() {
		const template = state.template;
		if (!template) {
			nameInput.value = '';
			idInput.value = '';
			versionInput.value = '';
			descriptionInput.value = '';
			return;
		}
		nameInput.value = template.manifest.name || '';
		idInput.value = template.manifest.id || '';
		versionInput.value = template.manifest.version || '';
		descriptionInput.value = template.manifest.description || '';
	}

	function renderSchema() {
		schemaList.innerHTML = '';
		const template = state.template;
		if (!template) {
			return;
		}
		const schema = Array.isArray(template.manifest.schema) ? template.manifest.schema : [];
		if (!schema.length) {
			const hint = document.createElement('div');
			hint.className = 'hint';
			hint.textContent = 'Sem campos no schema.';
			schemaList.appendChild(hint);
			return;
		}
		schema.forEach((field, index) => {
			const row = document.createElement('div');
			row.className = 'schema-row';

			const keyInput = document.createElement('input');
			keyInput.value = field.key || '';
			keyInput.placeholder = 'key';
			keyInput.addEventListener('input', () => {
				field.key = keyInput.value;
				scheduleSave();
			});

			const typeSelect = document.createElement('select');
			['string', 'string[]', 'number', 'boolean'].forEach(type => {
				const option = document.createElement('option');
				option.value = type;
				option.textContent = type;
				typeSelect.appendChild(option);
			});
			typeSelect.value = field.type || 'string';
			typeSelect.addEventListener('change', () => {
				field.type = typeSelect.value;
				scheduleSave();
			});

			const labelInput = document.createElement('input');
			labelInput.value = field.label || '';
			labelInput.placeholder = 'label';
			labelInput.addEventListener('input', () => {
				field.label = labelInput.value;
				scheduleSave();
			});

			const removeButton = document.createElement('button');
			removeButton.className = 'ghost';
			removeButton.textContent = 'Remover';
			removeButton.addEventListener('click', () => {
				schema.splice(index, 1);
				scheduleSave();
				renderSchema();
			});

			row.appendChild(keyInput);
			row.appendChild(typeSelect);
			row.appendChild(labelInput);
			row.appendChild(removeButton);
			schemaList.appendChild(row);
		});
	}

	function renderPreviewForm() {
		previewForm.innerHTML = '';
		const template = state.template;
		if (!template) {
			return;
		}
		const schema = Array.isArray(template.manifest.schema) ? template.manifest.schema : [];
		if (!schema.length) {
			const hint = document.createElement('div');
			hint.className = 'hint';
			hint.textContent = 'Sem campos no schema.';
			previewForm.appendChild(hint);
			return;
		}
		const previewData = template.previewData && typeof template.previewData === 'object' && !Array.isArray(template.previewData)
			? template.previewData
			: {};
		schema.forEach((field, index) => {
			const row = document.createElement('div');
			const inputId = 'preview-field-' + index;
			const key = field.key || '';
			const label = document.createElement('label');
			label.textContent = field.label || key || 'campo';
			label.htmlFor = inputId;
			const type = field.type || 'string';

			if (type === 'boolean') {
				row.className = 'preview-row inline';
				const input = document.createElement('input');
				input.type = 'checkbox';
				input.id = inputId;
				input.checked = Boolean(previewData[key]);
				input.addEventListener('change', () => {
					setPreviewValue(key, input.checked);
				});
				row.appendChild(label);
				row.appendChild(input);
				previewForm.appendChild(row);
				return;
			}

			row.className = 'preview-row';
			row.appendChild(label);

			if (type === 'string[]') {
				const input = document.createElement('textarea');
				input.id = inputId;
				const raw = previewData[key];
				const lines = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/\r?\n/) : []);
				input.value = lines.join('\n');
				input.addEventListener('input', () => {
					const items = input.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
					setPreviewValue(key, items);
				});
				row.appendChild(input);
			} else if (type === 'number') {
				const input = document.createElement('input');
				input.id = inputId;
				input.type = 'number';
				input.step = 'any';
				const raw = previewData[key];
				input.value = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
				input.addEventListener('input', () => {
					const value = input.value.trim();
					const parsed = value === '' ? null : Number(value);
					setPreviewValue(key, Number.isFinite(parsed as number) ? parsed : value);
				});
				row.appendChild(input);
			} else {
				const input = document.createElement('input');
				input.id = inputId;
				input.type = 'text';
				input.value = previewData[key] ? String(previewData[key]) : '';
				input.addEventListener('input', () => {
					setPreviewValue(key, input.value);
				});
				row.appendChild(input);
			}

			previewForm.appendChild(row);
		});
	}

	function renderPreviewData() {
		const template = state.template;
		if (!template) {
			previewDataInput.value = '';
			return;
		}
		previewDataInput.value = JSON.stringify(template.previewData || {}, null, 2);
		previewDataValid = true;
		setPreviewError('');
	}

	function renderMainTex() {
		const template = state.template;
		mainTexInput.value = template ? template.mainTex || '' : '';
	}

	function renderReadOnly() {
		const template = state.template;
		const readOnly = Boolean(template?.readOnly);
		readOnlyBadge.style.display = readOnly ? 'inline-flex' : 'none';
		deleteButton.disabled = readOnly || !template;
		duplicateButton.disabled = !template;
		exportButton.disabled = !template;
		buildNowButton.disabled = !template;
		const formDisabled = !template || readOnly;
		[nameInput, idInput, versionInput, descriptionInput, addSchema, previewDataInput, mainTexInput].forEach(control => {
			control.disabled = formDisabled;
		});
		schemaList.querySelectorAll('input, textarea, select, button').forEach(control => {
			control.disabled = formDisabled;
		});
		previewForm.querySelectorAll('input, textarea, select').forEach(control => {
			control.disabled = formDisabled;
		});
		autoCompileToggle.checked = autoCompile;
	}

	function render() {
		renderTemplates();
		const template = state.template;
		if (template && template.manifest?.id) {
			templateSelect.value = template.manifest.id;
		} else {
			templateSelect.value = '';
		}
		renderMetadata();
		renderSchema();
		renderPreviewForm();
		renderPreviewData();
		renderMainTex();
		renderReadOnly();
	}

	function setPreviewValue(key, value) {
		if (!key) {
			return;
		}
		if (!state.template) {
			return;
		}
		const previewData = state.template.previewData && typeof state.template.previewData === 'object' && !Array.isArray(state.template.previewData)
			? state.template.previewData
			: {};
		previewData[key] = value;
		state.template.previewData = previewData;
		previewDataValid = true;
		setPreviewError('');
		previewDataInput.value = JSON.stringify(previewData, null, 2);
		scheduleSave();
	}

	function scheduleSave() {
		if (!state.template) {
			return;
		}
		if (!previewDataValid || !idValid) {
			return;
		}
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			sendSave();
		}, 500);
	}

	function sendSave() {
		const template = state.template;
		if (!template || !previewDataValid) {
			return;
		}
		const draft = {
			manifest: template.manifest,
			mainTex: template.mainTex,
			previewData: template.previewData
		};
		vscode.postMessage({ type: 'saveTemplate', draft, previousId: lastTemplateId });
	}

	function slugify(value) {
		return String(value)
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9\s-_]/g, '')
			.trim()
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function validateId(value) {
		return /^[a-z0-9][a-z0-9-_]*$/.test(value);
	}

	templateSelect.addEventListener('change', () => {
		const value = templateSelect.value;
		if (!value) {
			return;
		}
		vscode.postMessage({ type: 'selectTemplate', id: value });
	});

	newButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'createTemplate' });
	});

	duplicateButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'duplicateTemplate' });
	});

	deleteButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'deleteTemplate' });
	});

	exportButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'exportTemplate' });
	});

	autoCompileToggle.addEventListener('change', () => {
		autoCompile = autoCompileToggle.checked;
		vscode.postMessage({ type: 'setAutoCompile', value: autoCompile });
	});

	buildNowButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'buildNow' });
	});

	nameInput.addEventListener('input', () => {
		if (!state.template) {
			return;
		}
		state.template.manifest.name = nameInput.value;
		if (!idDirty) {
			const nextId = slugify(nameInput.value);
			idInput.value = nextId;
			state.template.manifest.id = nextId;
			idValid = validateId(nextId);
			if (!idValid) {
				setError('ID invalido. Use letras, numeros, hifen ou underscore.');
			} else {
				setError('');
			}
		}
		scheduleSave();
	});

	idInput.addEventListener('input', () => {
		if (!state.template) {
			return;
		}
		idDirty = true;
		state.template.manifest.id = idInput.value.trim();
		idValid = validateId(state.template.manifest.id);
		if (!idValid) {
			setError('ID invalido. Use letras, numeros, hifen ou underscore.');
		} else {
			setError('');
		}
		scheduleSave();
	});

	versionInput.addEventListener('input', () => {
		if (!state.template) {
			return;
		}
		state.template.manifest.version = versionInput.value;
		scheduleSave();
	});

	descriptionInput.addEventListener('input', () => {
		if (!state.template) {
			return;
		}
		state.template.manifest.description = descriptionInput.value;
		scheduleSave();
	});

	addSchema.addEventListener('click', () => {
		if (!state.template) {
			return;
		}
		const schema = Array.isArray(state.template.manifest.schema) ? state.template.manifest.schema : [];
		const nextIndex = schema.length + 1;
		schema.push({ key: 'campo_' + nextIndex, type: 'string', label: 'Campo ' + nextIndex });
		state.template.manifest.schema = schema;
		scheduleSave();
		renderSchema();
		renderPreviewForm();
	});

	previewDataInput.addEventListener('input', () => {
		if (!state.template) {
			return;
		}
		try {
			const parsed = JSON.parse(previewDataInput.value || '{}');
			state.template.previewData = parsed;
			previewDataValid = true;
			setPreviewError('');
			renderPreviewForm();
			scheduleSave();
		} catch (err) {
			previewDataValid = false;
			setPreviewError('JSON invalido.');
		}
	});

	mainTexInput.addEventListener('input', () => {
		if (!state.template) {
			return;
		}
		state.template.mainTex = mainTexInput.value;
		scheduleSave();
	});

	window.addEventListener('message', (event) => {
		const msg = event.data || {};
		if (msg.type === 'state') {
			setState(msg.state);
		}
		if (msg.type === 'status') {
			setStatus(msg.status);
		}
		if (msg.type === 'error') {
			setError(msg.message || '');
		}
	});

	render();
	vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i += 1) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
