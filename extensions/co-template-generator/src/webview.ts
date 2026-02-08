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
	.card {
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		margin-bottom: 12px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
	}
	label {
		display: block;
		font-size: 11px;
		margin: 4px 0 6px;
		color: var(--muted);
	}
	select {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.9);
		color: inherit;
		font-size: 12px;
	}
	.status {
		font-size: 12px;
		margin-top: 8px;
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
</style>
</head>
<body data-ui-build="${safeBuildId}">
	<div class="header">
		<h1>Gerador de Template</h1>
	</div>

	<section class="card">
		<label for="modelSelect">Modelo</label>
		<select id="modelSelect">
			<option value="tarefa">Tarefa</option>
			<option value="oficio">Oficio</option>
		</select>
		<div class="status" id="buildStatus" data-state="idle"></div>
	</section>

	<div id="errorLine" class="error-line"></div>

<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	let state = ${stateJson};
	let lastRequestedId = '';

	const modelSelect = document.getElementById('modelSelect');
	const statusEl = document.getElementById('buildStatus');
	const errorLine = document.getElementById('errorLine');
	const MODEL_IDS = ['tarefa', 'oficio'];

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

	function requestSelect(id) {
		if (!id || lastRequestedId === id) {
			return;
		}
		lastRequestedId = id;
		vscode.postMessage({ type: 'selectTemplate', id });
	}

	function setState(next) {
		state = next || { templates: [] };
		setError('');
		render();
	}

	function render() {
		const currentId = state?.template?.manifest?.id || '';
		if (MODEL_IDS.includes(currentId)) {
			modelSelect.value = currentId;
			return;
		}
		const fallback = MODEL_IDS.includes(modelSelect.value) ? modelSelect.value : MODEL_IDS[0];
		modelSelect.value = fallback;
		requestSelect(fallback);
	}

	modelSelect.addEventListener('change', () => {
		const value = modelSelect.value;
		if (!value) {
			return;
		}
		requestSelect(value);
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
