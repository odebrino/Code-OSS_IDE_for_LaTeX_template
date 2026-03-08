/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type DataSetItemSummary = {
	id: string;
	name: string;
	type: 'project' | 'task' | 'template' | 'pdf' | 'log';
	location: 'workspace' | 'global';
	pathLabel: string;
	detail?: string;
	canOpen: boolean;
};

export type DataSetStatus = {
	state: 'idle' | 'scanning' | 'ready' | 'error';
	message?: string;
};

export type DataSetState = {
	roots: string[];
	items: DataSetItemSummary[];
};

export type MessageHandler = (message: { type?: string;[key: string]: JsonValue | undefined }, webview: vscode.Webview) => void | Promise<void>;

export class DataSetViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private readonly uiBuildId: string;
	private lastHtmlBuildId?: string;
	private state: DataSetState;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly onMessage: MessageHandler,
		private readonly getState: () => DataSetState,
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

	sendState(state: DataSetState) {
		this.state = state;
		this.view?.webview.postMessage({ type: 'state', state });
	}

	sendStatus(status: DataSetStatus) {
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
		this.view.webview.html = getDataSetHtml(this.view.webview, this.state, this.uiBuildId);
		this.lastHtmlBuildId = this.uiBuildId;
	}
}

export function registerDataSetView(
	context: vscode.ExtensionContext,
	onMessage: MessageHandler,
	getState: () => DataSetState,
	onVisible?: () => void
) {
	const provider = new DataSetViewProvider(context, onMessage, getState, getUiBuildId(context), onVisible);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('co.dataSet.mainView', provider)
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

function getDataSetHtml(webview: vscode.Webview, state: DataSetState, uiBuildId: string): string {
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
<title>Data Set</title>
<style>
	:root {
		--bg: radial-gradient(120% 60% at -20% -10%, rgba(60, 130, 246, 0.18), transparent 60%),
			radial-gradient(120% 70% at 110% 0%, rgba(34, 197, 94, 0.18), transparent 55%),
			var(--vscode-sideBar-background, #141312);
		--card-bg: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 92%, transparent);
		--card-border: color-mix(in srgb, var(--vscode-editor-foreground, #f1f1f1) 12%, transparent);
		--text: var(--vscode-foreground, #f1f1f1);
		--muted: color-mix(in srgb, var(--vscode-foreground, #f1f1f1) 70%, transparent);
		--accent: #22c55e;
		--accent-strong: #16a34a;
		--shadow: 0 16px 30px rgba(0, 0, 0, 0.35);
		--radius: 14px;
		--font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
		--font-body: "Alegreya Sans", "Trebuchet MS", "Lucida Sans Unicode", sans-serif;
	}
	body {
		margin: 0;
		padding: 16px;
		font-family: var(--font-body);
		font-size: 15px;
		line-height: 1.5;
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
		letter-spacing: 0.2em;
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
		max-width: 42ch;
	}
	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 999px;
		background: rgba(34, 197, 94, 0.12);
		color: #86efac;
		font-size: 12px;
		white-space: nowrap;
	}
	.status-chip[data-state="scanning"] {
		background: rgba(59, 130, 246, 0.18);
		color: #bfdbfe;
	}
	.status-chip[data-state="error"] {
		background: rgba(248, 113, 113, 0.2);
		color: #fecaca;
	}
	.card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: var(--radius);
		padding: 16px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card-title {
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--muted);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label {
		font-size: 12px;
		color: var(--muted);
	}
	input, textarea, select {
		background: color-mix(in srgb, var(--vscode-input-background, #1e1e1e) 92%, transparent);
		border: 1px solid color-mix(in srgb, var(--vscode-input-border, #3f3f3f) 70%, transparent);
		border-radius: 10px;
		padding: 10px 12px;
		color: var(--text);
		font-family: var(--font-body);
		font-size: 14px;
	}
	.select-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 12px;
	}
	.button-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	button {
		background: linear-gradient(120deg, rgba(34, 197, 94, 0.18), rgba(59, 130, 246, 0.2));
		border: 1px solid rgba(34, 197, 94, 0.4);
		color: var(--text);
		padding: 8px 14px;
		border-radius: 999px;
		font-weight: 600;
		cursor: pointer;
	}
	button.secondary {
		background: transparent;
		border: 1px solid var(--card-border);
		color: var(--muted);
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.root-list {
		font-size: 12px;
		color: var(--muted);
		line-height: 1.4;
	}
	.results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		color: var(--muted);
	}
	.results {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.result-card {
		border-radius: 12px;
		border: 1px solid var(--card-border);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(0, 0, 0, 0.08);
	}
	.result-title {
		font-weight: 700;
		font-size: 16px;
	}
	.result-meta {
		font-size: 12px;
		color: var(--muted);
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.tag {
		display: inline-flex;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		background: rgba(34, 197, 94, 0.2);
		color: #bbf7d0;
	}
	.tag.type-project {
		background: rgba(59, 130, 246, 0.2);
		color: #bfdbfe;
	}
	.tag.type-task {
		background: rgba(34, 197, 94, 0.2);
		color: #bbf7d0;
	}
	.tag.type-template {
		background: rgba(250, 204, 21, 0.2);
		color: #fef08a;
	}
	.tag.type-pdf {
		background: rgba(244, 63, 94, 0.2);
		color: #fecdd3;
	}
	.tag.type-log {
		background: rgba(249, 115, 22, 0.2);
		color: #fed7aa;
	}
	.tag.tag-location {
		background: rgba(148, 163, 184, 0.2);
		color: #e2e8f0;
	}
	.empty-state {
		text-align: center;
		color: var(--muted);
		font-size: 13px;
		padding: 16px;
		border-radius: 12px;
		border: 1px dashed var(--card-border);
	}
	.error-line {
		min-height: 20px;
		font-size: 12px;
		color: #fecaca;
	}
	.build-id {
		font-size: 11px;
		color: var(--muted);
		text-align: right;
	}
	.hidden {
		display: none;
	}
	@media (max-width: 640px) {
		.hero {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
</head>
<body>
	<div class="container">
		<header class="hero">
			<div>
				<div class="eyebrow">CO LAB</div>
				<h1>Data Set</h1>
				<p class="lead">Visualize projetos, tarefas, templates e PDFs gerados em workspaces ou no storage global.</p>
			</div>
			<div id="statusLine" class="status-chip" data-state="idle">Aguardando</div>
		</header>

		<section class="card">
			<div class="card-title">Busca</div>
			<div class="field">
				<label for="queryInput">Busca</label>
				<input id="queryInput" type="text" placeholder="Nome ou caminho" />
			</div>
			<div class="select-row">
				<div class="field">
					<label for="typeFilter">Tipo</label>
					<select id="typeFilter">
						<option value="all">Todos</option>
						<option value="project">Projeto</option>
						<option value="task">Tarefa</option>
						<option value="template">Template</option>
						<option value="pdf">PDF</option>
						<option value="log">Log</option>
					</select>
				</div>
				<div class="field">
					<label for="locationFilter">Origem</label>
					<select id="locationFilter">
						<option value="all">Todos</option>
						<option value="workspace">Workspace</option>
						<option value="global">Global</option>
					</select>
				</div>
			</div>
			<div class="button-row">
				<button id="refreshBtn">Atualizar lista</button>
				<button id="clearBtn" class="secondary">Limpar filtros</button>
			</div>
			<div id="rootList" class="root-list"></div>
		</section>

		<section class="card">
			<div class="results-header">
				<div>Resultados</div>
				<div id="resultCount">0 itens</div>
			</div>
			<div id="results" class="results"></div>
			<div id="emptyState" class="empty-state hidden">Nenhum item encontrado.</div>
		</section>

		<div id="errorLine" class="error-line"></div>
		<div class="build-id">UI build ${safeBuildId}</div>
	</div>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let state = ${stateJson};
	const queryInput = document.getElementById('queryInput');
	const typeFilter = document.getElementById('typeFilter');
	const locationFilter = document.getElementById('locationFilter');
	const refreshBtn = document.getElementById('refreshBtn');
	const clearBtn = document.getElementById('clearBtn');
	const resultsEl = document.getElementById('results');
	const resultCount = document.getElementById('resultCount');
	const emptyState = document.getElementById('emptyState');
	const rootList = document.getElementById('rootList');
	const statusLine = document.getElementById('statusLine');
	const errorLine = document.getElementById('errorLine');
	let didInitialize = false;

	function setStatus(status) {
		const state = status?.state || 'idle';
		const message = status?.message || (state === 'scanning'
			? 'Atualizando...'
			: state === 'ready'
				? 'Lista pronta'
				: state === 'error'
					? 'Falha ao ler dados'
					: 'Aguardando');
		statusLine.textContent = message;
		statusLine.dataset.state = state;
	}

	function setError(message) {
		errorLine.textContent = message || '';
	}

	function setState(next) {
		state = next || { roots: [], items: [] };
		setError('');
		if (!didInitialize) {
			didInitialize = true;
			resetFilters();
		}
		render();
	}

	function normalizeForSearch(value) {
		return String(value ?? '')
			.normalize('NFD')
			.replace(/[\\u0300-\\u036f]/g, '')
			.toLowerCase();
	}

	function renderRoots() {
		const roots = state?.roots || [];
		if (!roots.length) {
			rootList.textContent = '';
			return;
		}
		rootList.innerHTML = '<strong>Fontes:</strong> ' + roots.map(escapeHtml).join(' | ');
	}

	function applyFilters(items) {
		const query = normalizeForSearch(queryInput.value.trim());
		const type = typeFilter.value;
		const location = locationFilter.value;
		return items.filter(item => {
			if (type !== 'all' && item.type !== type) {
				return false;
			}
			if (location !== 'all' && item.location !== location) {
				return false;
			}
			if (query) {
				const haystack = normalizeForSearch(item.name + ' ' + item.pathLabel + ' ' + (item.detail || ''));
				if (!haystack.includes(query)) {
					return false;
				}
			}
			return true;
		});
	}

	function renderResults(items) {
		if (!items.length) {
			resultsEl.innerHTML = '';
			emptyState.classList.remove('hidden');
			return;
		}
		emptyState.classList.add('hidden');
		resultsEl.innerHTML = items.map(item => {
			const typeClass = 'type-' + item.type;
			const typeLabel = item.type === 'project'
				? 'Projeto'
				: item.type === 'task'
					? 'Tarefa'
					: item.type === 'template'
						? 'Template'
						: item.type === 'log'
							? 'Log'
							: 'PDF';
			const locationLabel = item.location === 'workspace' ? 'Workspace' : 'Global';
			const disabled = item.canOpen ? '' : 'disabled';
			const buttonLabel = item.type === 'pdf'
				? 'Abrir PDF'
				: item.type === 'log'
					? 'Abrir log'
					: 'Abrir arquivo';
			const detailHtml = item.detail ? '<span>' + escapeHtml(item.detail) + '</span>' : '';
			return '<div class="result-card">'
				+ '<div class="result-title">' + escapeHtml(item.name) + '</div>'
				+ '<div class="result-meta">'
				+ '<span class="tag ' + typeClass + '">' + typeLabel + '</span>'
				+ '<span class="tag tag-location">' + locationLabel + '</span>'
				+ detailHtml
				+ '<span>' + escapeHtml(item.pathLabel) + '</span>'
				+ '</div>'
				+ '<div class="button-row"><button class="open-btn" data-id="' + escapeHtml(item.id) + '" ' + disabled + '>' + buttonLabel + '</button></div>'
				+ '</div>';
		}).join('');

		resultsEl.querySelectorAll('.open-btn').forEach(button => {
			button.addEventListener('click', event => {
				const target = event.currentTarget;
				const id = target.getAttribute('data-id');
				if (!id) {
					return;
				}
				vscode.postMessage({ type: 'openItem', id });
			});
		});
	}

	function render() {
		const items = Array.isArray(state.items) ? state.items : [];
		renderRoots();
		const filtered = applyFilters(items);
		renderResults(filtered);
		if (items.length && filtered.length !== items.length) {
			resultCount.textContent = filtered.length + ' de ' + items.length + ' itens';
		} else if (items.length) {
			resultCount.textContent = items.length + ' itens';
		} else {
			resultCount.textContent = '0 itens';
		}
	}

	function resetFilters() {
		queryInput.value = '';
		typeFilter.value = 'all';
		locationFilter.value = 'all';
	}

	queryInput.addEventListener('input', () => render());
	typeFilter.addEventListener('change', () => render());
	locationFilter.addEventListener('change', () => render());
	refreshBtn.addEventListener('click', () => {
		vscode.postMessage({ type: 'refresh' });
	});

	clearBtn.addEventListener('click', () => {
		resetFilters();
		render();
	});

	window.addEventListener('message', event => {
		const message = event.data || {};
		if (message.type === 'state') {
			setState(message.state);
		}
		if (message.type === 'status') {
			setStatus(message.status);
		}
		if (message.type === 'error') {
			setError(message.message);
		}
	});

	resetFilters();
	render();
	vscode.postMessage({ type: 'requestState' });
	vscode.postMessage({ type: 'refresh' });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i += 1) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}
