/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';
import type { TemplateFieldSchema } from 'co-template-core';

type MessageHandler = (message: any, webview: vscode.Webview) => void | Promise<void>;

export type DiagramadorStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
};

type DiagramadorFieldValue = string | number | boolean | string[] | null;

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
};

export type DiagramadorState = {
	templates: DiagramadorTemplateSummary[];
	selectedTemplateId: string;
	schema: TemplateFieldSchema[];
	data: Record<string, DiagramadorFieldValue>;
	status: DiagramadorStatus;
	buildError?: string;
	buildLogPath?: string;
	tasks: DiagramadorTaskSummary[];
	currentTaskId?: string;
	activeTab?: 'document' | 'templates';
	templateEditor?: {
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
		revision?: number;
	};
};

export class DiagramadorViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private readonly uiBuildId: string;
	private lastHtmlBuildId?: string;
	private state: DiagramadorState;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler,
		private readonly getState: () => DiagramadorState,
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
			localResourceRoots: [
				this.context.extensionUri,
				vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
				vscode.Uri.joinPath(this.context.extensionUri, 'dist')
			]
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

	sendState(state: DiagramadorState) {
		this.state = state;
		this.view?.webview.postMessage({ type: 'state', state });
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
		this.view.webview.html = getDiagramadorHtml(this.view.webview, this.state, this.uiBuildId);
		this.lastHtmlBuildId = this.uiBuildId;
	}
}

export function registerDiagramadorView(
	context: vscode.ExtensionContext,
	onMessage: MessageHandler,
	getState: () => DiagramadorState,
	onVisible?: () => void
) {
	const provider = new DiagramadorViewProvider(context, onMessage, getState, getUiBuildId(context), onVisible);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('co.diagramador.blocksView', provider)
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

function getDiagramadorHtml(
	webview: vscode.Webview,
	state: DiagramadorState,
	uiBuildId: string
): string {
	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} https: data: blob:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`font-src ${webview.cspSource}`,
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
<title>Diagramador</title>
<style>
	:root {
		--bg: radial-gradient(120% 80% at -10% -20%, rgba(56, 189, 248, 0.18), transparent 60%),
			radial-gradient(120% 70% at 110% -10%, rgba(249, 115, 22, 0.18), transparent 55%),
			var(--vscode-sideBar-background, #f7f4ef);
		--surface: var(--vscode-editor-background, #ffffff);
		--card-bg: linear-gradient(120deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.04) 45%), var(--surface);
		--card-border: var(--vscode-panel-border, rgba(0, 0, 0, 0.12));
		--text: var(--vscode-foreground, #222222);
		--muted: var(--vscode-descriptionForeground, rgba(100, 100, 100, 0.8));
		--accent: #f97316;
		--accent-strong: #fb923c;
		--shadow: 0 16px 30px rgba(0, 0, 0, 0.18);
		--radius: 14px;
		--font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
		--font-body: "Alegreya Sans", "Trebuchet MS", "Lucida Sans Unicode", sans-serif;
	}
	body {
		font-family: var(--font-body);
		font-size: 14px;
		line-height: 1.45;
		margin: 0;
		padding: 16px;
		color: var(--text);
		background: var(--bg);
		min-height: 100vh;
		background-attachment: fixed;
	}
	.container {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.hero {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.hero h1 {
		font-family: var(--font-display);
		font-size: 24px;
		margin: 4px 0 6px;
	}
	.lead {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
		max-width: 38ch;
	}
	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--card-border);
		background: rgba(8, 8, 8, 0.5);
		font-size: 13px;
		color: var(--text);
	}
	.status-chip::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--muted);
		box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
	}
	.status-chip[data-state="building"]::before {
		background: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
	}
	.status-chip[data-state="success"]::before {
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
	}
	.status-chip[data-state="error"]::before {
		background: #ef4444;
		box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
	}
	.status-stack {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
	}
	.meta {
		font-size: 12px;
		color: var(--muted);
	}
	.card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: var(--radius);
		padding: 14px;
		box-shadow: var(--shadow);
		position: relative;
		overflow: hidden;
		animation: rise 0.45s ease both;
		animation-delay: var(--delay, 0s);
	}
	.tabs {
		display: flex;
		gap: 8px;
		margin: 6px 0 2px;
	}
	.tab-button {
		flex: 1;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		padding: 8px 12px;
		background: rgba(12, 12, 12, 0.35);
		color: var(--text);
		font-family: var(--font-body);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	.tab-button[data-active="true"] {
		background: var(--accent);
		color: #1a1208;
		border-color: rgba(0, 0, 0, 0.2);
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.panel.hidden {
		display: none;
	}
	.hidden {
		display: none;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.asset-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.asset-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--card-border);
		background: rgba(10, 10, 10, 0.35);
	}
	.code-input {
		font-family: "SFMono-Regular", "Fira Code", "Consolas", "Liberation Mono", monospace;
		font-size: 12px;
		min-height: 120px;
	}
	.error-line {
		font-size: 12px;
		color: #f87171;
		min-height: 14px;
	}
	.card::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(120deg, rgba(255, 255, 255, 0.06), transparent 45%);
		pointer-events: none;
	}
	.card-title {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.02em;
		margin-bottom: 10px;
	}
	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.card-header .card-title {
		margin-bottom: 0;
	}
	.task-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.task-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(10, 10, 10, 0.45);
	}
	.task-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.task-actions button {
		padding: 6px 10px;
		font-size: 11px;
	}
	.task-item[data-active="true"] {
		border-color: rgba(249, 115, 22, 0.6);
		box-shadow: 0 0 0 1px rgba(249, 115, 22, 0.18) inset;
	}
	.task-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.task-title {
		font-weight: 600;
	}
	.task-date {
		font-size: 11px;
		color: var(--muted);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 10px;
	}
	.field:last-child { margin-bottom: 0; }
	.field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	label {
		display: block;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	input, textarea, select {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(10, 10, 10, 0.5);
		color: var(--text);
		font-size: 14px;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
	}
	select:focus,
	input:focus,
	textarea:focus {
		outline: 2px solid rgba(249, 115, 22, 0.35);
		border-color: rgba(249, 115, 22, 0.55);
	}
	input[type="checkbox"] {
		width: auto;
		margin: 0;
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	textarea { resize: vertical; min-height: 160px; }
	button {
		width: auto;
		background: linear-gradient(135deg, var(--accent), var(--accent-strong));
		color: #1f1406;
		border: none;
		cursor: pointer;
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		box-shadow: 0 8px 20px rgba(249, 115, 22, 0.25);
	}
	button.secondary {
		background: rgba(148, 163, 184, 0.25);
		color: var(--text);
		border: 1px solid rgba(148, 163, 184, 0.4);
		box-shadow: none;
	}
	button:disabled { opacity: 0.5; cursor: not-allowed; }
	.empty {
		font-size: 12px;
		color: var(--muted);
		padding: 6px 0;
	}
	.hint {
		font-size: 12px;
		color: var(--muted);
		margin-top: 8px;
	}
	.section {
		margin-top: 14px;
		padding-top: 6px;
		border-top: 1px dashed rgba(255, 255, 255, 0.12);
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}
	.section-title {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}
	.member-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		margin-bottom: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 999px;
		border: 1px solid rgba(249, 115, 22, 0.35);
		background: rgba(249, 115, 22, 0.12);
		font-size: 12px;
	}
	.chip button {
		background: transparent;
		color: inherit;
		padding: 0 6px;
		border-radius: 999px;
		box-shadow: none;
	}
	.build-id {
		font-size: 10px;
		color: rgba(220, 220, 220, 0.55);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	@keyframes rise {
		from { opacity: 0; transform: translateY(6px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@media (max-width: 420px) {
		.field-grid { grid-template-columns: 1fr; }
		.hero { flex-direction: column; }
		.task-item { flex-direction: column; align-items: flex-start; }
	}
</style>
</head>
<body>
	<div class="container">
	<div class="hero">
			<div>
				<div class="eyebrow">Diagramador</div>
				<h1>Diagramador de Tarefas</h1>
				<p class="lead">Preencha os blocos e o PDF atualiza automaticamente ao lado.</p>
			</div>
			<div class="status-stack">
				<div class="status-chip" id="status" data-state="idle">Aguardando alteracoes</div>
				<div id="buildError" class="error-line"></div>
				<button id="buildLogButton" class="secondary hidden" type="button">Abrir log</button>
			</div>
		</div>
		<div class="tabs">
			<button id="tabDocument" class="tab-button" data-tab="document" data-active="true" type="button">Documento</button>
			<button id="tabTemplates" class="tab-button" data-tab="templates" data-active="false" type="button">Templates</button>
		</div>

		<div id="documentPanel" class="panel">
			<div class="meta" id="templateTitle"></div>

			<section class="card" style="--delay: 0s;">
				<div class="card-header">
				<div class="card-title">Suas Tarefas:</div>
					<button id="newTaskButton" type="button">Nova Tarefa</button>
				</div>
				<div id="tasksList" class="task-list"></div>
				<div id="tasksHint" class="hint"></div>
			</section>

			<section class="card" style="--delay: 0.05s;">
				<div class="card-title">Selecionador de Template</div>
				<div class="field">
					<label for="templateSelect">Template</label>
					<select id="templateSelect"></select>
				</div>
				<div class="hint">Template simples para validar preview.</div>
			</section>

			<section class="card" style="--delay: 0.1s;">
				<div class="card-title">Campos do Template</div>
				<div id="fieldsContainer"></div>
				<div id="fieldsHint" class="hint"></div>
			</section>
		</div>

		<div id="templatesPanel" class="panel hidden">
			<section class="card" style="--delay: 0s;">
				<div class="card-header">
					<div class="card-title">Templates</div>
					<div class="actions">
						<button id="templateCreateButton" type="button">Novo</button>
						<button id="templateDuplicateButton" type="button">Duplicar</button>
						<button id="templateExportButton" type="button">Exportar ZIP</button>
						<button id="templateImportButton" type="button">Importar ZIP</button>
						<button id="templateDeleteButton" type="button">Excluir</button>
					</div>
				</div>
				<div class="field">
					<label for="templateEditorSelect">Selecionar</label>
					<select id="templateEditorSelect"></select>
				</div>
				<div class="card-header" style="margin-top: 6px;">
					<div class="card-title">Preview</div>
					<div class="status-chip" id="templateStatus" data-state="idle">Aguardando alteracoes</div>
				</div>
				<div id="templateError" class="error-line"></div>
				<div id="templateBuildError" class="error-line"></div>
				<button id="templateBuildLogButton" class="secondary hidden" type="button">Abrir log</button>
			</section>

			<section class="card" style="--delay: 0.05s;">
				<div class="card-header">
					<div class="card-title">Editor</div>
					<button id="templateSaveButton" type="button">Salvar</button>
				</div>
				<div class="field">
					<label for="templateManifestInput">template.json</label>
					<textarea id="templateManifestInput" class="code-input" spellcheck="false"></textarea>
					<div id="templateManifestError" class="error-line"></div>
				</div>
				<div class="field">
					<label for="templateMainTexInput">main.tex</label>
					<textarea id="templateMainTexInput" class="code-input" spellcheck="false"></textarea>
				</div>
				<div class="field">
					<label for="templatePreviewInput">preview_data.json</label>
					<textarea id="templatePreviewInput" class="code-input" spellcheck="false"></textarea>
					<div id="templatePreviewError" class="error-line"></div>
				</div>
			</section>

			<section class="card" style="--delay: 0.1s;">
				<div class="card-header">
					<div class="card-title">Assets</div>
					<button id="templateAddAssetButton" type="button">Adicionar</button>
				</div>
				<input id="templateAssetInput" type="file" multiple class="hidden" />
				<div id="templateAssetsList" class="asset-list"></div>
				<div class="hint">Arquivos copiados para a pasta assets do template.</div>
			</section>
		</div>

		<div class="build-id">UI_BUILD: ${safeBuildId}</div>
	</div>

<script nonce="${nonce}">
	console.log('[co-diagramador] webview boot');
	window.addEventListener('error', e => console.error('[co-diagramador] window.error', e.error || e.message));
	window.addEventListener('unhandledrejection', e => console.error('[co-diagramador] unhandledrejection', e.reason));
	const vscode = (typeof acquireVsCodeApi === 'function')
		? acquireVsCodeApi()
		: { postMessage: () => { }, getState: () => undefined, setState: () => { } };
	let state = ${stateJson};

	const statusEl = document.getElementById('status');
	const buildErrorEl = document.getElementById('buildError');
	const buildLogButton = document.getElementById('buildLogButton');
	const templateTitleEl = document.getElementById('templateTitle');
	const tasksList = document.getElementById('tasksList');
	const tasksHint = document.getElementById('tasksHint');
	const newTaskButton = document.getElementById('newTaskButton');
	const templateSelect = document.getElementById('templateSelect');
	const fieldsContainer = document.getElementById('fieldsContainer');
	const fieldsHint = document.getElementById('fieldsHint');
	const tabDocument = document.getElementById('tabDocument');
	const tabTemplates = document.getElementById('tabTemplates');
	const documentPanel = document.getElementById('documentPanel');
	const templatesPanel = document.getElementById('templatesPanel');
	const templateEditorSelect = document.getElementById('templateEditorSelect');
	const templateCreateButton = document.getElementById('templateCreateButton');
	const templateDuplicateButton = document.getElementById('templateDuplicateButton');
	const templateDeleteButton = document.getElementById('templateDeleteButton');
	const templateExportButton = document.getElementById('templateExportButton');
	const templateImportButton = document.getElementById('templateImportButton');
	const templateSaveButton = document.getElementById('templateSaveButton');
	const templateStatusEl = document.getElementById('templateStatus');
	const templateErrorEl = document.getElementById('templateError');
	const templateBuildErrorEl = document.getElementById('templateBuildError');
	const templateBuildLogButton = document.getElementById('templateBuildLogButton');
	const templateManifestInput = document.getElementById('templateManifestInput');
	const templateManifestErrorEl = document.getElementById('templateManifestError');
	const templateMainTexInput = document.getElementById('templateMainTexInput');
	const templatePreviewInput = document.getElementById('templatePreviewInput');
	const templatePreviewErrorEl = document.getElementById('templatePreviewError');
	const templateAssetsList = document.getElementById('templateAssetsList');
	const templateAssetInput = document.getElementById('templateAssetInput');
	const templateAddAssetButton = document.getElementById('templateAddAssetButton');
	const noop = () => { };

	let activeTab = 'document';
	let templateDraft = { manifestText: '', mainTex: '', previewText: '' };
	let templateDraftId = '';
	let templateDraftRevision = 0;
	let templateDirty = false;
	const FIELD_UPDATE_DEBOUNCE_MS = 400;
	const pendingFieldUpdates = new Map();

	function normalizeState(next) {
		const base = next && typeof next === 'object' ? next : {};
		const editor = base.templateEditor && typeof base.templateEditor === 'object' ? base.templateEditor : {};
		const template = editor.template && typeof editor.template === 'object' ? editor.template : undefined;
		return {
			templates: Array.isArray(base.templates) ? base.templates : [],
			selectedTemplateId: typeof base.selectedTemplateId === 'string' ? base.selectedTemplateId : '',
			schema: Array.isArray(base.schema) ? base.schema : [],
			data: base.data && typeof base.data === 'object' ? base.data : {},
			status: base.status && typeof base.status === 'object' ? base.status : { state: 'idle' },
			buildError: typeof base.buildError === 'string' ? base.buildError : '',
			buildLogPath: typeof base.buildLogPath === 'string' ? base.buildLogPath : '',
			tasks: Array.isArray(base.tasks) ? base.tasks : [],
			currentTaskId: typeof base.currentTaskId === 'string' ? base.currentTaskId : '',
			activeTab: base.activeTab === 'templates' ? 'templates' : 'document',
			templateEditor: {
				selectedTemplateId: typeof editor.selectedTemplateId === 'string' ? editor.selectedTemplateId : '',
				template: template
					? {
						manifest: template.manifest || {},
						mainTex: typeof template.mainTex === 'string' ? template.mainTex : '',
						previewData: template.previewData && typeof template.previewData === 'object' ? template.previewData : {},
						readOnly: Boolean(template.readOnly),
						assets: Array.isArray(template.assets) ? template.assets : []
					}
					: undefined,
				status: editor.status && typeof editor.status === 'object' ? editor.status : { state: 'idle' },
				error: typeof editor.error === 'string' ? editor.error : '',
				buildError: typeof editor.buildError === 'string' ? editor.buildError : '',
				buildLogPath: typeof editor.buildLogPath === 'string' ? editor.buildLogPath : '',
				revision: Number.isFinite(editor.revision) ? editor.revision : 0
			}
		};
	}

	function sendFieldUpdate(key, value) {
		vscode.postMessage({ type: 'updateField', key, value });
	}

	function queueFieldUpdate(key, value) {
		const entry = pendingFieldUpdates.get(key);
		if (entry?.timer) {
			clearTimeout(entry.timer);
		}
		const timer = window.setTimeout(() => {
			pendingFieldUpdates.delete(key);
			sendFieldUpdate(key, value);
		}, FIELD_UPDATE_DEBOUNCE_MS);
		pendingFieldUpdates.set(key, { timer, value });
	}

	function flushFieldUpdate(key) {
		const entry = pendingFieldUpdates.get(key);
		if (!entry) {
			return;
		}
		clearTimeout(entry.timer);
		pendingFieldUpdates.delete(key);
		sendFieldUpdate(key, entry.value);
	}

	function flushPendingFieldUpdates() {
		Array.from(pendingFieldUpdates.keys()).forEach(key => flushFieldUpdate(key));
	}

	function clearPendingFieldUpdates() {
		for (const entry of pendingFieldUpdates.values()) {
			clearTimeout(entry.timer);
		}
		pendingFieldUpdates.clear();
	}

	function setState(next) {
		const previousTaskId = state.currentTaskId;
		state = normalizeState(next);
		if (previousTaskId && state.currentTaskId !== previousTaskId) {
			clearPendingFieldUpdates();
		}
		if (state.activeTab && state.activeTab !== activeTab) {
			activeTab = state.activeTab;
		}
		renderAll();
	}

	function applyActiveTab(tab, notify) {
		activeTab = tab === 'templates' ? 'templates' : 'document';
		tabDocument.dataset.active = String(activeTab === 'document');
		tabTemplates.dataset.active = String(activeTab === 'templates');
		documentPanel.classList.toggle('hidden', activeTab !== 'document');
		templatesPanel.classList.toggle('hidden', activeTab !== 'templates');
		if (notify) {
			vscode.postMessage({ type: 'setTab', tab: activeTab });
		}
	}

	function isEditorEnabled() {
		return Boolean(state.currentTaskId);
	}

	function readFileAsBase64(file) {
		return new Promise((resolve) => {
			if (!file) {
				resolve('');
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result;
				if (typeof result === 'string') {
					const commaIndex = result.indexOf(',');
					resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
					return;
				}
				resolve('');
			};
			reader.onerror = () => resolve('');
			reader.readAsDataURL(file);
		});
	}

	function formatTaskDate(value) {
		if (!Number.isFinite(value) || value <= 0) {
			return '';
		}
		const date = new Date(value);
		return date.toLocaleString('pt-BR');
	}

	function renderTasks() {
		tasksList.innerHTML = '';
		if (!state.tasks.length) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = 'Nenhuma tarefa salva.';
			tasksList.appendChild(empty);
			tasksHint.textContent = 'Crie uma nova tarefa para iniciar.';
			return;
		}
		tasksHint.textContent = state.currentTaskId
			? 'Selecione outra tarefa para editar.'
			: 'Selecione uma tarefa para editar.';
		state.tasks.forEach((task) => {
			const row = document.createElement('div');
			row.className = 'task-item';
			row.dataset.active = String(task.id === state.currentTaskId);
			const meta = document.createElement('div');
			meta.className = 'task-meta';
			const title = document.createElement('div');
			title.className = 'task-title';
			title.textContent = task.label || 'Tarefa';
			const date = document.createElement('div');
			date.className = 'task-date';
			const formatted = formatTaskDate(task.updatedAt);
			date.textContent = formatted ? 'Atualizada em ' + formatted : 'Atualizada recentemente';
			meta.appendChild(title);
			meta.appendChild(date);
			const actions = document.createElement('div');
			actions.className = 'task-actions';
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'secondary';
			if (task.id === state.currentTaskId) {
				button.textContent = 'Em Edicao';
				button.disabled = true;
			} else {
				button.textContent = 'Abrir';
				button.addEventListener('click', () => {
					flushPendingFieldUpdates();
					vscode.postMessage({ type: 'openTask', taskId: task.id });
				});
			}
			actions.appendChild(button);
			const renameButton = document.createElement('button');
			renameButton.type = 'button';
			renameButton.className = 'secondary';
			renameButton.textContent = 'Renomear';
			renameButton.addEventListener('click', () => {
				flushPendingFieldUpdates();
				vscode.postMessage({ type: 'renameTask', taskId: task.id, label: task.label });
			});
			actions.appendChild(renameButton);
			const deleteButton = document.createElement('button');
			deleteButton.type = 'button';
			deleteButton.className = 'secondary';
			deleteButton.textContent = 'Excluir';
			deleteButton.addEventListener('click', () => {
				flushPendingFieldUpdates();
				vscode.postMessage({ type: 'deleteTask', taskId: task.id });
			});
			actions.appendChild(deleteButton);
			row.appendChild(meta);
			row.appendChild(actions);
			tasksList.appendChild(row);
		});
	}

	function renderTemplateOptions() {
		templateSelect.innerHTML = '';
		if (!state.templates.length) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Nenhum template encontrado';
			templateSelect.appendChild(option);
			templateSelect.disabled = true;
			return;
		}
		state.templates.forEach((template) => {
			const option = document.createElement('option');
			option.value = template.id;
			option.textContent = template.name || template.id;
			templateSelect.appendChild(option);
		});
	}

	function getSelectedTemplateId() {
		if (state.selectedTemplateId && state.templates.some(template => template.id === state.selectedTemplateId)) {
			return state.selectedTemplateId;
		}
		return state.templates[0]?.id || '';
	}

	function renderTemplate() {
		renderTemplateOptions();
		const selectedId = getSelectedTemplateId();
		state.selectedTemplateId = selectedId;
		const current = state.templates.find(template => template.id === selectedId);
		templateTitleEl.textContent = current ? 'Template: ' + (current.name || current.id) : 'Template: -';
		templateSelect.value = selectedId || '';
		templateSelect.disabled = !state.templates.length;
	}

	function isMultilineKey(key) {
		return /body|text|descricao|conteudo/i.test(key) && !/height|altura|tamanho|size/i.test(key);
	}

	function getFieldValue(key) {
		if (!state.data || typeof state.data !== 'object') {
			return undefined;
		}
		if (Object.prototype.hasOwnProperty.call(state.data, key)) {
			return state.data[key];
		}
		return undefined;
	}

	function updateField(key, value, immediate) {
		if (!isEditorEnabled()) {
			return;
		}
		state.data = { ...state.data, [key]: value };
		if (immediate) {
			const entry = pendingFieldUpdates.get(key);
			if (entry) {
				clearTimeout(entry.timer);
				pendingFieldUpdates.delete(key);
			}
			sendFieldUpdate(key, value);
			return;
		}
		queueFieldUpdate(key, value);
	}

	function renderFields() {
		fieldsContainer.innerHTML = '';
		fieldsHint.textContent = '';
		if (!isEditorEnabled()) {
			fieldsHint.textContent = 'Selecione uma tarefa para editar.';
			return;
		}
		if (!state.schema.length) {
			fieldsHint.textContent = 'Template sem schema.';
			return;
		}
		state.schema.forEach((field) => {
			const fieldEl = document.createElement('div');
			fieldEl.className = 'field';
			const label = document.createElement('label');
			const inputId = 'field-' + field.key;
			label.htmlFor = inputId;
			label.textContent = field.label || field.key;
			fieldEl.appendChild(label);
			const value = getFieldValue(field.key);
			if (field.type === 'boolean') {
				const row = document.createElement('div');
				row.className = 'checkbox-row';
				const input = document.createElement('input');
				input.type = 'checkbox';
				input.id = inputId;
				input.checked = value === true || value === 'true';
				input.disabled = !isEditorEnabled();
				input.addEventListener('change', () => {
					updateField(field.key, input.checked, true);
				});
				row.appendChild(input);
				fieldEl.appendChild(row);
			} else if (field.type === 'string[]') {
				const input = document.createElement('textarea');
				input.id = inputId;
				input.placeholder = '1 item por linha';
				input.value = Array.isArray(value) ? value.join('\n') : (value === null || value === undefined ? '' : String(value));
				input.disabled = !isEditorEnabled();
				input.addEventListener('input', () => {
					const lines = input.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
					updateField(field.key, lines);
				});
				input.addEventListener('blur', () => {
					flushFieldUpdate(field.key);
				});
				fieldEl.appendChild(input);
			} else if (field.type === 'number') {
				const input = document.createElement('input');
				input.id = inputId;
				input.type = 'number';
				input.step = 'any';
				const parsed = typeof value === 'string' ? Number(value) : value;
				input.value = Number.isFinite(parsed) ? String(parsed) : '';
				input.disabled = !isEditorEnabled();
				input.addEventListener('input', () => {
					const raw = input.value.trim();
					if (!raw) {
						updateField(field.key, null);
						return;
					}
					const parsed = Number(raw);
					updateField(field.key, Number.isFinite(parsed) ? parsed : null);
				});
				input.addEventListener('blur', () => {
					flushFieldUpdate(field.key);
				});
				fieldEl.appendChild(input);
			} else if (field.type === 'latex') {
				const input = document.createElement('textarea');
				input.id = inputId;
				input.placeholder = 'Aceita comandos LaTeX.';
				input.value = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
				input.disabled = !isEditorEnabled();
				input.addEventListener('input', () => {
					updateField(field.key, input.value);
				});
				input.addEventListener('blur', () => {
					flushFieldUpdate(field.key);
				});
				fieldEl.appendChild(input);
			} else {
				const multiline = isMultilineKey(field.key);
				const input = multiline ? document.createElement('textarea') : document.createElement('input');
				input.id = inputId;
				if (!multiline) {
					input.type = 'text';
				}
				input.value = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
				input.disabled = !isEditorEnabled();
				input.addEventListener('input', () => {
					updateField(field.key, input.value);
				});
				input.addEventListener('blur', () => {
					flushFieldUpdate(field.key);
				});
				fieldEl.appendChild(input);
			}
			fieldsContainer.appendChild(fieldEl);
		});
	}

	function setTemplateStatus(status) {
		const nextState = status?.state || 'idle';
		const message = status?.message || (nextState === 'building'
			? 'Gerando PDF...'
			: nextState === 'success'
				? 'PDF atualizado'
				: nextState === 'error'
					? 'Falha ao gerar PDF'
					: 'Aguardando alteracoes');
		templateStatusEl.textContent = message;
		templateStatusEl.dataset.state = nextState;
	}

	function setTemplateError(message) {
		templateErrorEl.textContent = message || '';
	}

	function setBuildError(message, logPath) {
		buildErrorEl.textContent = message || '';
		const hasLog = Boolean(logPath);
		buildLogButton.classList.toggle('hidden', !hasLog);
		buildLogButton.disabled = !hasLog;
	}

	function setTemplateBuildError(message, logPath) {
		templateBuildErrorEl.textContent = message || '';
		const hasLog = Boolean(logPath);
		templateBuildLogButton.classList.toggle('hidden', !hasLog);
		templateBuildLogButton.disabled = !hasLog;
	}

	function refreshTemplateDraft(editor) {
		const template = editor?.template;
		const revision = typeof editor?.revision === 'number' ? editor.revision : 0;
		const nextId = template?.manifest?.id || '';
		if (!templateDirty || templateDraftId !== nextId || templateDraftRevision !== revision) {
			templateDraftId = nextId;
			templateDraftRevision = revision;
			templateDraft = {
				manifestText: template ? JSON.stringify(template.manifest || {}, null, 2) : '',
				mainTex: template ? template.mainTex || '' : '',
				previewText: template ? JSON.stringify(template.previewData || {}, null, 2) : ''
			};
			templateDirty = false;
		}
	}

	function confirmDiscardTemplateChanges() {
		if (!templateDirty) {
			return true;
		}
		const ok = window.confirm('Ha alteracoes nao salvas no template atual. Deseja descartar?');
		if (!ok) {
			return false;
		}
		templateDirty = false;
		return true;
	}

	function validateJsonInput(text, errorEl) {
		if (!errorEl) {
			return true;
		}
		if (!text.trim()) {
			errorEl.textContent = '';
			return true;
		}
		try {
			JSON.parse(text);
			errorEl.textContent = '';
			return true;
		} catch {
			errorEl.textContent = 'JSON invalido.';
			return false;
		}
	}

	function validateTemplateDraft() {
		const manifestOk = validateJsonInput(templateManifestInput.value, templateManifestErrorEl);
		const previewOk = validateJsonInput(templatePreviewInput.value, templatePreviewErrorEl);
		return manifestOk && previewOk;
	}

	function renderTemplateEditor() {
		const editor = state.templateEditor || {};
		const template = editor.template;
		const selectedId = editor.selectedTemplateId || template?.manifest?.id || '';
		templateEditorSelect.innerHTML = '';
		if (!state.templates.length) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Nenhum template encontrado';
			templateEditorSelect.appendChild(option);
			templateEditorSelect.disabled = true;
		} else {
			state.templates.forEach((entry) => {
				const option = document.createElement('option');
				option.value = entry.id;
				option.textContent = entry.name || entry.id;
				templateEditorSelect.appendChild(option);
			});
			templateEditorSelect.disabled = false;
			templateEditorSelect.value = selectedId || state.templates[0].id;
		}

		const isReadOnly = Boolean(template?.readOnly);
		const hasTemplate = Boolean(template);
		const editable = hasTemplate && !isReadOnly;
		templateCreateButton.disabled = false;
		templateDuplicateButton.disabled = !hasTemplate;
		templateDeleteButton.disabled = !hasTemplate || isReadOnly;
		templateExportButton.disabled = !hasTemplate;
		templateImportButton.disabled = false;
		templateSaveButton.disabled = !editable;
		templateManifestInput.disabled = !editable;
		templateMainTexInput.disabled = !editable;
		templatePreviewInput.disabled = !editable;
		templateAddAssetButton.disabled = !editable;
		templateAssetInput.disabled = !editable;

		refreshTemplateDraft(editor);
		templateManifestInput.value = templateDraft.manifestText;
		templateMainTexInput.value = templateDraft.mainTex;
		templatePreviewInput.value = templateDraft.previewText;
		validateTemplateDraft();

		templateAssetsList.innerHTML = '';
		if (!template || !Array.isArray(template.assets) || template.assets.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = 'Nenhum asset.';
			templateAssetsList.appendChild(empty);
		} else {
			template.assets.forEach((asset) => {
				const row = document.createElement('div');
				row.className = 'asset-item';
				const name = document.createElement('div');
				name.textContent = asset;
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'secondary';
				button.textContent = 'Remover';
				button.disabled = !editable;
				button.addEventListener('click', () => {
					vscode.postMessage({ type: 'templateDeleteAsset', name: asset });
				});
				row.appendChild(name);
				row.appendChild(button);
				templateAssetsList.appendChild(row);
			});
		}

		setTemplateStatus(editor.status);
		setTemplateError(editor.error);
		setTemplateBuildError(editor.buildError, editor.buildLogPath);
	}

	function setStatus(status) {
		const nextState = status?.state || 'idle';
		const message = status?.message || (nextState === 'building'
			? 'Gerando PDF...'
			: nextState === 'success'
				? 'PDF atualizado'
				: nextState === 'error'
					? 'Falha ao gerar PDF'
					: 'Aguardando alteracoes');
		statusEl.textContent = message;
		statusEl.dataset.state = nextState;
	}

	function renderAll() {
		applyActiveTab(activeTab, false);
		renderTasks();
		renderTemplate();
		renderFields();
		renderTemplateEditor();
		setStatus(state.status);
		setBuildError(state.buildError, state.buildLogPath);
	}

	function boot() {
		if (!statusEl || !newTaskButton || !templateSelect || !tabDocument || !tabTemplates || !templateSaveButton) {
			console.error('[co-diagramador] missing required DOM elements');
			return;
		}

	newTaskButton.addEventListener('click', () => {
		console.log('[co-diagramador] new task clicked');
		flushPendingFieldUpdates();
		const templateId = templateSelect.value || state.selectedTemplateId || '';
		vscode.postMessage({ type: 'createTask', templateId });
	});

	templateSelect.addEventListener('change', () => {
		console.log('[co-diagramador] template changed');
		const value = templateSelect.value;
		if (value === state.selectedTemplateId) {
			return;
		}
		flushPendingFieldUpdates();
		state.selectedTemplateId = value;
		vscode.postMessage({ type: 'updateTemplate', templateId: value });
	});

	tabDocument.addEventListener('click', () => {
		console.log('[co-diagramador] tab document clicked');
		flushPendingFieldUpdates();
		applyActiveTab('document', true);
	});

	tabTemplates.addEventListener('click', () => {
		console.log('[co-diagramador] tab templates clicked');
		flushPendingFieldUpdates();
		applyActiveTab('templates', true);
	});

	templateEditorSelect.addEventListener('change', () => {
		const value = templateEditorSelect.value;
		if (!value) {
			return;
		}
		if (value === state.templateEditor?.selectedTemplateId) {
			return;
		}
		if (!confirmDiscardTemplateChanges()) {
			templateEditorSelect.value = state.templateEditor?.selectedTemplateId || '';
			return;
		}
		templateDirty = false;
		vscode.postMessage({ type: 'templateSelect', templateId: value });
	});

	templateCreateButton.addEventListener('click', () => {
		if (!confirmDiscardTemplateChanges()) {
			return;
		}
		vscode.postMessage({ type: 'templateCreate' });
	});

	templateDuplicateButton.addEventListener('click', () => {
		if (!confirmDiscardTemplateChanges()) {
			return;
		}
		vscode.postMessage({ type: 'templateDuplicate' });
	});

	templateDeleteButton.addEventListener('click', () => {
		if (!confirmDiscardTemplateChanges()) {
			return;
		}
		vscode.postMessage({ type: 'templateDelete' });
	});

	templateExportButton.addEventListener('click', () => {
		vscode.postMessage({ type: 'templateExport' });
	});

	templateImportButton.addEventListener('click', () => {
		if (!confirmDiscardTemplateChanges()) {
			return;
		}
		vscode.postMessage({ type: 'templateImport' });
	});

	templateSaveButton.addEventListener('click', () => {
		console.log('[co-diagramador] generate clicked');
		vscode.postMessage({ type: 'co-diagramador:generate', payload: { source: 'templateSaveButton' } });
		if (!validateTemplateDraft()) {
			return;
		}
		vscode.postMessage({
			type: 'templateSave',
			manifestText: templateManifestInput.value,
			mainTex: templateMainTexInput.value,
			previewText: templatePreviewInput.value,
			previousId: templateDraftId
		});
	});

	buildLogButton.addEventListener('click', () => {
		console.log('[co-diagramador] open build log clicked');
		vscode.postMessage({ type: 'openBuildLog', scope: 'document' });
	});

	templateBuildLogButton.addEventListener('click', () => {
		console.log('[co-diagramador] open template log clicked');
		vscode.postMessage({ type: 'openBuildLog', scope: 'template' });
	});

	templateManifestInput.addEventListener('input', () => {
		templateDraft.manifestText = templateManifestInput.value;
		templateDirty = true;
		validateJsonInput(templateManifestInput.value, templateManifestErrorEl);
	});

	templateMainTexInput.addEventListener('input', () => {
		templateDraft.mainTex = templateMainTexInput.value;
		templateDirty = true;
	});

	templatePreviewInput.addEventListener('input', () => {
		templateDraft.previewText = templatePreviewInput.value;
		templateDirty = true;
		validateJsonInput(templatePreviewInput.value, templatePreviewErrorEl);
	});

	templateAddAssetButton.addEventListener('click', () => {
		console.log('[co-diagramador] add asset clicked');
		templateAssetInput.click();
	});

	templateAssetInput.addEventListener('change', async () => {
		const files = Array.from(templateAssetInput.files || []);
		for (const file of files) {
			const base64 = await readFileAsBase64(file);
			if (!base64) {
				continue;
			}
			vscode.postMessage({ type: 'templateAddAsset', name: file.name, contents: base64 });
		}
		templateAssetInput.value = '';
	});

	window.addEventListener('message', (event) => {
		const msg = event.data;
		console.log('[co-diagramador] received', msg);
		if (msg.type === 'state') {
			setState(msg.state);
		}
		if (msg.type === 'co-diagramador:ack') {
			console.log('[co-diagramador] ack', msg);
		}
	});

	setState(state);
	vscode.postMessage({ type: 'ready' });
	window.__CO_DIAGRAMADOR_READY__ = true;
	console.log('[co-diagramador] ready');
	}

	if (document.readyState === 'loading') {
		window.addEventListener('DOMContentLoaded', boot, { once: true });
	} else {
		boot();
	}
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
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
