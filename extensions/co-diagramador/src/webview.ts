/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-unexternalized-strings */

import * as vscode from 'vscode';
import {
	DiagramadorHostMessage,
	DiagramadorState,
	DiagramadorWebviewMessage
} from './protocol';
import { getDiagramadorClientScript } from './webviewClient';

type MessageHandler = (message: DiagramadorWebviewMessage, webview: vscode.Webview) => void | Promise<void>;

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
		view.webview.onDidReceiveMessage(message => this.onMessage(message as DiagramadorWebviewMessage, view.webview));
		view.onDidChangeVisibility(() => {
			if (view.visible) {
				this.refreshWebview(false);
				this.sendState(this.getState());
				this.onVisible?.();
			}
		});
	}

	sendState(state: DiagramadorState) {
		this.state = state;
		void this.view?.webview.postMessage({ type: 'state', state } satisfies DiagramadorHostMessage);
	}

	show(preserveFocus = true) {
		this.refreshWebview(false);
		this.sendState(this.getState());
		this.view?.show(preserveFocus);
	}

	private refreshWebview(_force = false) {
		if (!this.view) {
			return;
		}
		const shouldRebuildHtml = !this.lastHtmlBuildId || this.lastHtmlBuildId !== this.uiBuildId;
		if (!shouldRebuildHtml) {
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
		`script-src 'nonce-${nonce}' ${webview.cspSource}`
	].join('; ');
	const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
	const safeBuildId = escapeHtml(uiBuildId);
	const clientScript = getDiagramadorClientScript(stateJson);

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
		--muted: var(--vscode-descriptionForeground, rgba(100, 100, 100, 0.82));
		--accent: #f97316;
		--shadow: 0 16px 30px rgba(0, 0, 0, 0.18);
		--radius: 16px;
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
	body.modal-open {
		overflow: hidden;
	}
	.container {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.hero {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
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
		max-width: 42ch;
		color: var(--muted);
	}
	.meta {
		font-size: 12px;
		color: var(--muted);
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
	.card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: var(--radius);
		padding: 14px;
		box-shadow: var(--shadow);
		position: relative;
		overflow: hidden;
	}
	.card::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(120deg, rgba(255, 255, 255, 0.06), transparent 45%);
		pointer-events: none;
	}
	.card > * {
		position: relative;
		z-index: 1;
	}
	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.card-title {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.02em;
		margin: 0;
	}
	.hidden {
		display: none !important;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	button {
		border: none;
		border-radius: 999px;
		padding: 9px 14px;
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
		transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease;
	}
	button:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.primary-button {
		background: var(--accent);
		color: #1a1208;
	}
	.secondary-button {
		background: rgba(12, 12, 12, 0.45);
		color: var(--text);
		border: 1px solid var(--card-border);
	}
	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 12px;
	}
	.info-card {
		padding: 12px;
		border-radius: 12px;
		border: 1px solid var(--card-border);
		background: rgba(10, 10, 10, 0.28);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.info-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--muted);
	}
	.info-value {
		font-size: 14px;
		font-weight: 600;
	}
	.field-stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-radius: 12px;
		border: 1px solid var(--card-border);
		background: rgba(10, 10, 10, 0.28);
	}
	.field-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--muted);
	}
	.field-input,
	.field-textarea,
	select {
		width: 100%;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		background: rgba(12, 12, 12, 0.5);
		color: var(--text);
		padding: 10px 12px;
		font: inherit;
		box-sizing: border-box;
	}
	.field-textarea {
		min-height: 120px;
		resize: vertical;
	}
	.code-input {
		font-family: "SFMono-Regular", "Fira Code", "Consolas", "Liberation Mono", monospace;
		font-size: 12px;
	}
	.field-checkbox {
		width: 18px;
		height: 18px;
	}
	.task-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.task-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border-radius: 12px;
		border: 1px solid var(--card-border);
		background: rgba(10, 10, 10, 0.28);
	}
	.task-copy h3 {
		margin: 0 0 4px;
		font-size: 15px;
	}
	.task-meta {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.empty-copy {
		margin: 0;
		color: var(--muted);
	}
	.detail-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}
	.detail-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--card-border);
		background: rgba(10, 10, 10, 0.25);
	}
	.detail-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}
	.detail-value {
		white-space: pre-wrap;
		word-break: break-word;
	}
	.error-copy {
		margin: 0;
		color: #f87171;
		white-space: pre-wrap;
	}
	.modal-shell {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 28px;
		background: rgba(10, 10, 12, 0.72);
		backdrop-filter: blur(10px);
		z-index: 50;
	}
	.modal-card {
		width: min(860px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		overflow: auto;
		padding: 24px;
		border-radius: 28px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background:
			radial-gradient(120% 120% at 0% 0%, rgba(249, 115, 22, 0.18), transparent 45%),
			radial-gradient(120% 120% at 100% 0%, rgba(56, 189, 248, 0.16), transparent 40%),
			linear-gradient(180deg, rgba(20, 20, 24, 0.96), rgba(12, 12, 16, 0.98));
		box-shadow: 0 32px 60px rgba(0, 0, 0, 0.4);
	}
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 22px;
	}
	.modal-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.1;
	}
	.modal-copy {
		margin: 6px 0 0;
		max-width: 56ch;
		color: rgba(255, 255, 255, 0.72);
	}
	.stepper {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-bottom: 22px;
	}
	.step-card {
		padding: 14px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.05);
	}
	.step-index {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(249, 115, 22, 0.16);
		color: #ffd5ba;
		font-size: 12px;
		font-weight: 700;
		margin-bottom: 10px;
	}
	.step-title {
		display: block;
		font-size: 13px;
		font-weight: 700;
		color: #fff;
		margin-bottom: 4px;
	}
	.step-detail {
		display: block;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.68);
	}
	.modal-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.9fr);
		gap: 18px;
	}
	.modal-column {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.modal-panel {
		padding: 16px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.05);
	}
	.modal-panel h3 {
		margin: 0 0 6px;
		font-size: 15px;
	}
	.modal-panel p {
		margin: 0;
		color: rgba(255, 255, 255, 0.68);
	}
	.modal-field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.modal-field-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: rgba(255, 255, 255, 0.58);
	}
	.modal-input {
		width: 100%;
		box-sizing: border-box;
		padding: 14px 16px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.05);
		color: #fff;
		font: inherit;
	}
	.option-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
	}
	.option-card {
		width: 100%;
		padding: 16px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.04);
		color: #fff;
		text-align: left;
	}
	.option-card-selected {
		border-color: rgba(249, 115, 22, 0.78);
		background: linear-gradient(160deg, rgba(249, 115, 22, 0.24), rgba(56, 189, 248, 0.08));
		box-shadow: 0 14px 28px rgba(249, 115, 22, 0.18);
	}
	.option-title {
		display: block;
		font-size: 15px;
		font-weight: 700;
		margin-bottom: 4px;
	}
	.option-description {
		display: block;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.68);
	}
	.modal-preview {
		display: grid;
		gap: 12px;
	}
	.modal-preview-item {
		padding: 14px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(8, 8, 12, 0.32);
	}
	.modal-preview-label {
		display: block;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255, 255, 255, 0.52);
		margin-bottom: 6px;
	}
	.modal-preview-value {
		display: block;
		font-size: 15px;
		font-weight: 700;
		color: #fff;
		word-break: break-word;
	}
	.modal-errors {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.modal-error {
		font-size: 12px;
		color: #fca5a5;
	}
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 20px;
	}
	.modal-footer-copy {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
	}
	@media (max-width: 720px) {
		body {
			padding: 12px;
		}
		.hero,
		.task-item,
		.card-header {
			flex-direction: column;
			align-items: stretch;
		}
		.status-stack {
			align-items: flex-start;
		}
		.modal-shell {
			padding: 12px;
		}
		.modal-card {
			padding: 18px;
		}
		.modal-layout,
		.stepper {
			grid-template-columns: 1fr;
		}
		.modal-footer {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
</head>
<body>
<div class="container">
	<section class="hero">
		<div>
			<div class="eyebrow">CO Diagramador</div>
			<h1>Edicao por tarefa</h1>
			<p class="lead">Organize suas tarefas em uma lista simples e abra apenas a que estiver editando. Os campos do documento aparecem somente quando uma tarefa estiver aberta.</p>
		</div>
		<div class="status-stack">
			<div id="status" class="status-chip" data-state="idle">Selecione ou crie uma tarefa.</div>
			<div class="meta">UI ${safeBuildId}</div>
		</div>
	</section>

	<section id="listView" class="card">
		<div class="card-header">
			<div>
				<h2 class="card-title">Suas Tarefas</h2>
			</div>
			<button id="newTaskButton" type="button" class="primary-button">Nova Tarefa</button>
		</div>
		<p id="tasksHint" class="empty-copy">Nenhuma tarefa criada ainda.</p>
		<div id="tasksList" class="task-list"></div>
	</section>

	<section id="taskView" class="hidden">
		<div class="card">
			<div class="card-header">
				<div>
					<h2 id="taskTitle" class="card-title">Tarefa</h2>
					<p class="empty-copy">Edite os metadados fixos e depois os campos do template selecionado.</p>
				</div>
				<button id="backToListButton" type="button" class="secondary-button">Voltar</button>
			</div>
			<div class="info-grid">
				<label class="info-card" for="taskNameInput">
					<span class="info-label">Nome</span>
					<input id="taskNameInput" class="field-input" type="text" />
				</label>
				<label class="info-card" for="taskTypeSelect">
					<span class="info-label">Tipo</span>
					<select id="taskTypeSelect">
						<option value="teorica">teorica</option>
						<option value="pratica">pratica</option>
						<option value="salinha">salinha</option>
					</select>
				</label>
				<div class="info-card">
					<span class="info-label">Template</span>
					<div id="taskTemplateValue" class="info-value">-</div>
				</div>
			</div>
		</div>

		<div class="card">
			<div class="card-header">
				<div>
					<h2 class="card-title">Campos do Documento</h2>
					<p class="empty-copy">Os metadados fixos ficam acima; o restante vem do schema do template.</p>
				</div>
			</div>
			<p id="fieldsHint" class="empty-copy">Abra uma tarefa para editar os campos do documento.</p>
			<div id="fieldsContainer" class="field-stack"></div>
		</div>
	</section>

	<div id="createTaskModal" class="modal-shell hidden" aria-hidden="true">
		<div class="modal-card">
			<div class="modal-header">
				<div>
					<div class="eyebrow">Nova Tarefa</div>
					<h2 class="modal-title">Crie e abra uma tarefa em um fluxo unico</h2>
					<p class="modal-copy">Defina nome, tipo e template antes da criacao. O documento abre imediatamente para edicao assim que a tarefa for persistida.</p>
				</div>
				<button id="createTaskCancelButton" type="button" class="secondary-button">Cancelar</button>
			</div>

			<div class="stepper">
				<div class="step-card">
					<span class="step-index">1</span>
					<span class="step-title">Nome</span>
					<span class="step-detail">Identifique a tarefa antes de abrir o editor.</span>
				</div>
				<div class="step-card">
					<span class="step-index">2</span>
					<span class="step-title">Tipo</span>
					<span class="step-detail">Escolha o contexto inicial da atividade.</span>
				</div>
				<div class="step-card">
					<span class="step-index">3</span>
					<span class="step-title">Template</span>
					<span class="step-detail">O modelo padrao e tarefa, com oficio como alternativa.</span>
				</div>
			</div>

			<form id="createTaskForm">
				<div class="modal-layout">
					<div class="modal-column">
						<section class="modal-panel">
							<div class="modal-field">
								<label for="createTaskNameInput" class="modal-field-label">Nome da tarefa</label>
								<input id="createTaskNameInput" class="modal-input" type="text" placeholder="Ex: Lista 01" />
							</div>
							<div class="modal-errors">
								<div id="createTaskNameError" class="modal-error hidden"></div>
							</div>
						</section>

						<section class="modal-panel">
							<h3>Tipo da tarefa</h3>
							<p>Comece por um contexto padrao e ajuste os campos depois.</p>
							<div class="option-grid">
								<button type="button" class="option-card" data-task-type="teorica">
									<span class="option-title">teorica</span>
									<span class="option-description">Atividade conceitual com foco em texto e leitura.</span>
								</button>
								<button type="button" class="option-card" data-task-type="pratica">
									<span class="option-title">pratica</span>
									<span class="option-description">Execucao objetiva, exercicios ou operacao guiada.</span>
								</button>
								<button type="button" class="option-card" data-task-type="salinha">
									<span class="option-title">salinha</span>
									<span class="option-description">Formato curto para sala ou dinamica mais enxuta.</span>
								</button>
							</div>
							<div class="modal-errors">
								<div id="createTaskTypeError" class="modal-error hidden"></div>
							</div>
						</section>
					</div>

					<div class="modal-column">
						<section class="modal-panel">
							<h3>Resumo da criacao</h3>
							<p>O editor sera aberto assim que a tarefa for criada e o build inicial for agendado.</p>
							<div class="modal-field">
								<label class="modal-field-label">Modelo inicial</label>
								<div class="option-grid">
									<button type="button" class="option-card" data-template-id="tarefa">
										<span class="option-title">tarefa</span>
										<span class="option-description">Modelo padrao do diagramador para atividade comum.</span>
									</button>
									<button type="button" class="option-card" data-template-id="oficio">
										<span class="option-title">oficio</span>
										<span class="option-description">Estrutura enxuta para comunicacao formal.</span>
									</button>
								</div>
							</div>
							<div class="modal-preview">
								<div class="modal-preview-item">
									<span class="modal-preview-label">Nome</span>
									<span id="createTaskPreviewLabel" class="modal-preview-value">Nova tarefa</span>
								</div>
								<div class="modal-preview-item">
									<span class="modal-preview-label">Tipo</span>
									<span id="createTaskPreviewType" class="modal-preview-value">teorica</span>
								</div>
								<div class="modal-preview-item">
									<span class="modal-preview-label">Modelo inicial</span>
									<span id="createTaskPreviewTemplate" class="modal-preview-value">tarefa</span>
								</div>
							</div>
							<div class="modal-errors">
								<div id="createTaskTemplateError" class="modal-error hidden"></div>
								<div id="createTaskGeneralError" class="modal-error hidden"></div>
							</div>
						</section>
					</div>
				</div>

				<div class="modal-footer">
					<div class="modal-footer-copy">O template padrao e tarefa e o tipo padrao e teorica.</div>
					<div class="actions">
						<button id="createTaskSubmitButton" type="submit" class="primary-button">Criar e abrir</button>
					</div>
				</div>
			</form>
		</div>
	</div>
</div>
<script nonce="${nonce}">
${clientScript}
</script>
</body>
</html>`;
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 16; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
