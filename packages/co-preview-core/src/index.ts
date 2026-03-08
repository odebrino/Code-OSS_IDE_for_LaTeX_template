/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

export type PreviewMode = 'auto' | 'pdfjs' | 'system' | 'image';

export type PdfPreviewState = 'idle' | 'waiting_for_build' | 'ready' | 'build_error' | 'preview_error' | 'unavailable';

export type PreviewReasonCode =
	| 'pdf_not_found'
	| 'pdf_unreadable'
	| 'pdfjs_assets_missing'
	| 'native_viewer_open_failed'
	| 'image_fallback_failed'
	| 'iframe_fallback_used';

export type PreviewRenderMode = 'none' | 'status' | 'pdfjs' | 'custom_editor' | 'system' | 'image' | 'iframe';

export type PreviewOpenResult = {
	ok: boolean;
	modeUsed: PreviewRenderMode;
	reasonCode?: PreviewReasonCode;
	message: string;
	details: string[];
	state: PdfPreviewState;
};

export type PdfPreviewStatus = {
	state: PdfPreviewState;
	message: string;
	detail?: string;
	title?: string;
	path?: string;
};

export type PdfJsPaths = {
	root: string;
	pdfJsPath: string;
	pdfWorkerPath: string;
	viewerPath: string;
	viewerCssPath: string;
	cMapDir: string;
	standardFontsDir: string;
};

export type PdfPreviewManagerOptions = {
	extensionRoot: string;
	appName: string;
	title?: string;
	viewType?: string;
	previewMode?: PreviewMode;
	previewModeEnv?: string;
	pdfJsRoot?: string;
};

export class PdfPreviewManager implements vscode.Disposable {
	private lastViewPath?: string;
	private lastImagePath?: string;
	private panel?: vscode.WebviewPanel;
	private readonly previewMode: PreviewMode;
	private readonly preferPdfJs: boolean;
	private readonly viewType: string;
	private readonly title: string;
	private readonly pdfJsRoot?: string;
	private readonly pdfJsSearchRoots: string[];
	private previewListenerAttached = false;

	constructor(
		private readonly output: vscode.OutputChannel,
		options: PdfPreviewManagerOptions
	) {
		this.viewType = options.viewType ?? 'co.preview';
		this.title = options.title ?? 'CO Preview';
		this.previewMode = options.previewMode ?? resolvePreviewMode(options.previewModeEnv, options.appName);
		this.preferPdfJs = this.previewMode === 'pdfjs' || (this.previewMode === 'auto' && shouldPreferPdfJs(options.appName));
		this.pdfJsRoot = options.pdfJsRoot;
		this.pdfJsSearchRoots = [
			options.extensionRoot,
			process.cwd()
		].filter(Boolean);
		this.output.appendLine(`[${new Date().toISOString()}] Preview mode: ${this.previewMode}${this.preferPdfJs ? ' (prefer pdfjs)' : ''}`);
	}

	async open(previewPdfPath: string): Promise<PreviewOpenResult> {
		if (!await fileExists(previewPdfPath)) {
			return this.showStatus({
				state: 'waiting_for_build',
				message: 'PDF ainda nao foi gerado.',
				detail: previewPdfPath,
				path: previewPdfPath
			});
		}
		try {
			await fs.access(previewPdfPath);
		} catch (err: unknown) {
			return this.showStatus({
				state: 'preview_error',
				message: 'O PDF existe, mas nao pode ser lido para preview.',
				detail: `${previewPdfPath}\n${getErrorMessage(err)}`,
				path: previewPdfPath
			});
		}
		const viewPath = await this.copyForView(previewPdfPath);
		const result = await this.showPreview(viewPath);
		await this.cleanupOldCopies(path.dirname(previewPdfPath), [viewPath, this.lastImagePath]);
		return result;
	}

	async refresh(previewPdfPath: string): Promise<PreviewOpenResult> {
		return this.open(previewPdfPath);
	}

	async showStatus(status: PdfPreviewStatus): Promise<PreviewOpenResult> {
		const viewColumn = this.pickPreviewColumn();
		const roots = status.path ? [vscode.Uri.file(path.dirname(status.path))] : [];
		const panel = this.ensurePreviewPanel(viewColumn, roots);
		panel.webview.html = this.getStatusHtml(panel.webview, status);
		const detail = [status.detail, status.path].filter(Boolean).join('\n');
		const result: PreviewOpenResult = {
			ok: status.state === 'ready',
			modeUsed: 'status',
			reasonCode: mapStatusReason(status.state),
			message: status.message,
			details: detail ? [detail] : [],
			state: status.state
		};
		this.output.appendLine(`[${new Date().toISOString()}] Preview status: ${status.state} - ${status.message}${detail ? ` (${detail})` : ''}`);
		return result;
	}

	private async copyForView(previewPdfPath: string): Promise<string> {
		const dir = path.dirname(previewPdfPath);
		const viewName = `preview_view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
		const viewPath = path.join(dir, viewName);
		await fs.copyFile(previewPdfPath, viewPath);
		this.lastViewPath = viewPath;
		return viewPath;
	}

	private async showPreview(viewPath: string): Promise<PreviewOpenResult> {
		const viewColumn = this.pickPreviewColumn();
		const uri = vscode.Uri.file(viewPath);
		const details: string[] = [];
		if (this.preferPdfJs && await this.showPreviewWebviewPdfJs(viewPath, viewColumn)) {
			this.output.appendLine(`[${new Date().toISOString()}] Preview: pdfjs webview`);
			return {
				ok: true,
				modeUsed: 'pdfjs',
				message: 'Preview aberto com PDF.js.',
				details,
				state: 'ready'
			};
		}
		if (this.preferPdfJs) {
			details.push('PDF.js nao estava disponivel para o modo preferido.');
		}
		if (this.previewMode !== 'image') {
			const customViewer = await this.findPdfCustomEditorViewType();
			if (customViewer) {
				try {
					await vscode.commands.executeCommand('vscode.openWith', uri, customViewer, {
						viewColumn,
						preview: true
					});
					this.panel?.dispose();
					this.panel = undefined;
					this.output.appendLine(`[${new Date().toISOString()}] Preview: custom editor (${customViewer})`);
					return {
						ok: true,
						modeUsed: 'custom_editor',
						message: `Preview aberto com custom editor (${customViewer}).`,
						details,
						state: 'ready'
					};
				} catch (err: unknown) {
					const detail = `Falha ao abrir viewer PDF (${customViewer}): ${getErrorMessage(err)}`;
					this.output.appendLine(`[${new Date().toISOString()}] ${detail}`);
					details.push(detail);
				}
			}
			const hasPdfViewer = Boolean(vscode.extensions.getExtension('vscode.pdf') || vscode.extensions.getExtension('ms-vscode.pdf'));
			if (hasPdfViewer) {
				try {
					await vscode.commands.executeCommand('vscode.open', uri, {
						viewColumn,
						preview: true
					});
					this.panel?.dispose();
					this.panel = undefined;
					this.output.appendLine(`[${new Date().toISOString()}] Preview: vscode.open (builtin)`);
					return {
						ok: true,
						modeUsed: 'system',
						message: 'Preview aberto com o visualizador PDF do VS Code.',
						details,
						state: 'ready'
					};
				} catch (err: unknown) {
					const detail = `Falha ao abrir preview nativo: ${getErrorMessage(err)}`;
					this.output.appendLine(`[${new Date().toISOString()}] ${detail}`);
					details.push(detail);
				}
			}
		}
		if (!this.preferPdfJs && await this.showPreviewWebviewPdfJs(viewPath, viewColumn)) {
			this.output.appendLine(`[${new Date().toISOString()}] Preview: pdfjs webview (fallback)`);
			return {
				ok: true,
				modeUsed: 'pdfjs',
				message: 'Preview aberto com PDF.js.',
				details,
				state: 'ready'
			};
		}
		if (!this.preferPdfJs) {
			details.push('PDF.js nao estava disponivel no fallback.');
		}
		if (this.previewMode !== 'system') {
			const imagePath = await this.renderPreviewImage(viewPath);
			if (imagePath) {
				this.lastImagePath = imagePath;
				await this.showPreviewWebviewImage(imagePath, viewColumn);
				this.output.appendLine(`[${new Date().toISOString()}] Preview: png fallback`);
				return {
					ok: true,
					modeUsed: 'image',
					message: 'Preview aberto como imagem PNG.',
					details,
					state: 'ready'
				};
			}
			details.push('Falha ao renderizar preview por imagem com pdftoppm.');
		}
		await this.showPreviewWebviewPdf(viewPath, viewColumn);
		this.output.appendLine(`[${new Date().toISOString()}] Preview: iframe fallback`);
		return {
			ok: true,
			modeUsed: 'iframe',
			reasonCode: 'iframe_fallback_used',
			message: 'Preview aberto com fallback em iframe.',
			details,
			state: 'ready'
		};
	}

	private async findPdfCustomEditorViewType(): Promise<string | undefined> {
		for (const extension of vscode.extensions.all) {
			const customEditors = extension.packageJSON?.contributes?.customEditors;
			if (!Array.isArray(customEditors)) {
				continue;
			}
			const main = extension.packageJSON?.main;
			if (typeof main === 'string') {
				const mainPath = path.join(extension.extensionPath, main);
				if (!await fileExists(mainPath)) {
					continue;
				}
			}
			for (const editor of customEditors) {
				const selector = editor?.selector;
				const selectors = Array.isArray(selector) ? selector : selector ? [selector] : [];
				for (const entry of selectors) {
					const pattern = entry?.filenamePattern;
					if (typeof pattern !== 'string') {
						continue;
					}
					if (pattern.includes('.pdf') || pattern.includes('{pdf') || pattern.includes('pdf}')) {
						if (typeof editor.viewType === 'string') {
							return editor.viewType;
						}
					}
				}
			}
		}
		return undefined;
	}

	private async resolvePdfJsPaths(): Promise<PdfJsPaths | undefined> {
		const root = this.pdfJsRoot ?? await resolvePdfJsRoot(this.pdfJsSearchRoots);
		if (!root) {
			return undefined;
		}
		const pdfJsPath = path.join(root, 'build', 'pdf.mjs');
		const pdfWorkerPath = path.join(root, 'build', 'pdf.worker.mjs');
		const viewerPath = path.join(root, 'web', 'pdf_viewer.mjs');
		const viewerCssPath = path.join(root, 'web', 'pdf_viewer.css');
		const cMapDir = path.join(root, 'cmaps');
		const standardFontsDir = path.join(root, 'standard_fonts');
		if (!await fileExists(pdfJsPath)) {
			return undefined;
		}
		if (!await fileExists(pdfWorkerPath)) {
			return undefined;
		}
		if (!await fileExists(viewerPath)) {
			return undefined;
		}
		if (!await fileExists(viewerCssPath)) {
			return undefined;
		}
		if (!await fileExists(cMapDir)) {
			return undefined;
		}
		if (!await fileExists(standardFontsDir)) {
			return undefined;
		}
		return {
			root,
			pdfJsPath,
			pdfWorkerPath,
			viewerPath,
			viewerCssPath,
			cMapDir,
			standardFontsDir
		};
	}

	private async showPreviewWebviewPdfJs(viewPath: string, viewColumn: vscode.ViewColumn): Promise<boolean> {
		const paths = await this.resolvePdfJsPaths();
		if (!paths) {
			this.output.appendLine(`[${new Date().toISOString()}] PDF.js assets not found; skipping pdfjs preview.`);
			return false;
		}
		let pdfBase64: string | undefined;
		try {
			const pdfData = await fs.readFile(viewPath);
			pdfBase64 = pdfData.toString('base64');
		} catch (err: unknown) {
			this.output.appendLine(`[${new Date().toISOString()}] Falha ao ler PDF para preview: ${getErrorMessage(err)}`);
			return false;
		}
		const dir = path.dirname(viewPath);
		const panel = this.ensurePreviewPanel(viewColumn, [
			vscode.Uri.file(dir),
			vscode.Uri.file(paths.root)
		]);
		panel.webview.html = this.getPdfJsPreviewHtml(panel.webview, paths, pdfBase64);
		return true;
	}

	private ensurePreviewPanel(viewColumn: vscode.ViewColumn, localResourceRoots: vscode.Uri[]): vscode.WebviewPanel {
		if (!this.panel) {
			this.panel = vscode.window.createWebviewPanel(
				this.viewType,
				this.title,
				{ viewColumn, preserveFocus: true },
				{
					enableScripts: true,
					localResourceRoots
				}
			);
			this.panel.onDidDispose(() => {
				this.panel = undefined;
				this.previewListenerAttached = false;
			});
			if (!this.previewListenerAttached) {
				this.previewListenerAttached = true;
				this.panel.webview.onDidReceiveMessage(message => {
					if (message?.type === 'previewError') {
						this.output.appendLine(`[${new Date().toISOString()}] Preview error: ${message?.message ?? 'unknown'}`);
						if (message?.stack) {
							this.output.appendLine(message.stack);
						}
					}
				});
			}
		} else {
			this.panel.reveal(viewColumn, true);
			this.panel.webview.options = {
				enableScripts: true,
				localResourceRoots
			};
		}
		return this.panel;
	}

	private async renderPreviewImage(viewPath: string): Promise<string | undefined> {
		const dir = path.dirname(viewPath);
		const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const base = path.join(dir, `preview_view_${stamp}`);
		const args = ['-f', '1', '-l', '1', '-png', viewPath, base];
		const imagePath = `${base}-1.png`;
		return new Promise(resolve => {
			let stderr = '';
			const child = spawn('pdftoppm', args, { cwd: dir });
			child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			child.on('error', () => resolve(undefined));
			child.on('close', async (code: number | null) => {
				if (code !== 0) {
					if (stderr.trim()) {
						this.output.appendLine(`[${new Date().toISOString()}] pdftoppm: ${stderr.trim()}`);
					}
					resolve(undefined);
					return;
				}
				if (await fileExists(imagePath)) {
					resolve(imagePath);
					return;
				}
				resolve(undefined);
			});
		});
	}

	private async showPreviewWebviewPdf(viewPath: string, viewColumn: vscode.ViewColumn): Promise<void> {
		const dir = path.dirname(viewPath);
		const panel = this.ensurePreviewPanel(viewColumn, [vscode.Uri.file(dir)]);
		panel.webview.html = this.getPdfPreviewHtml(panel.webview, viewPath);
	}

	private async showPreviewWebviewImage(imagePath: string, viewColumn: vscode.ViewColumn): Promise<void> {
		const dir = path.dirname(imagePath);
		const panel = this.ensurePreviewPanel(viewColumn, [vscode.Uri.file(dir)]);
		panel.webview.html = this.getImagePreviewHtml(panel.webview, imagePath);
	}

	/* eslint-disable local/code-no-unexternalized-strings */
	private getPdfJsPreviewHtml(webview: vscode.Webview, paths: PdfJsPaths, pdfBase64: string): string {
		const nonce = getNonce();
		const csp = [
			"default-src 'none'",
			`img-src ${webview.cspSource} data: blob:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}' ${webview.cspSource}`,
			`connect-src ${webview.cspSource}`,
			`font-src ${webview.cspSource}`,
			`worker-src ${webview.cspSource} blob:`
		].join('; ');
		const pdfJsUri = webview.asWebviewUri(vscode.Uri.file(paths.pdfJsPath));
		const pdfWorkerUri = webview.asWebviewUri(vscode.Uri.file(paths.pdfWorkerPath));
		const viewerUri = webview.asWebviewUri(vscode.Uri.file(paths.viewerPath));
		const viewerCssUri = webview.asWebviewUri(vscode.Uri.file(paths.viewerCssPath));
		const cMapUri = webview.asWebviewUri(vscode.Uri.file(paths.cMapDir));
		const standardFontsUri = webview.asWebviewUri(vscode.Uri.file(paths.standardFontsDir));
		const pdfPayload = JSON.stringify(pdfBase64);
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${this.title}</title>
<link rel="stylesheet" href="${viewerCssUri}">
<style>
	:root { color-scheme: dark; }
	body {
		margin: 0;
		background: #1e1e1e;
		color: #d4d4d4;
		font-family: "Segoe UI", Arial, sans-serif;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #252526;
		border-bottom: 1px solid #333;
	}
	.toolbar .spacer { flex: 1; }
	button {
		background: #3c3c3c;
		color: #fff;
		border: 1px solid #4a4a4a;
		border-radius: 4px;
		padding: 4px 8px;
		cursor: pointer;
	}
	button:disabled { opacity: 0.5; cursor: default; }
	input[type="number"] {
		width: 64px;
		background: #1e1e1e;
		color: #d4d4d4;
		border: 1px solid #4a4a4a;
		border-radius: 4px;
		padding: 4px 6px;
	}
	.viewerRoot {
		position: relative;
		flex: 1 1 auto;
	}
	#viewerContainer {
		position: absolute;
		inset: 0;
		overflow: auto;
		background: #1e1e1e;
	}
	#viewer {
		margin: 0 auto;
	}
	.status {
		position: absolute;
		top: 52px;
		left: 12px;
		font-size: 12px;
		color: #9e9e9e;
	}
	.pdfViewer .page {
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
		margin: 12px auto;
	}
</style>
</head>
<body>
	<div class="toolbar">
		<button id="prevPage" type="button">Prev</button>
		<button id="nextPage" type="button">Next</button>
		<span>Page</span>
		<input id="pageNumber" type="number" min="1" value="1" />
		<span id="pageCount">/ 1</span>
		<span class="spacer"></span>
		<button id="zoomOut" type="button">-</button>
		<span id="zoomValue">100%</span>
		<button id="zoomIn" type="button">+</button>
		<button id="fitWidth" type="button">Fit width</button>
	</div>
	<div class="viewerRoot">
		<div id="viewerContainer">
			<div id="viewer" class="pdfViewer"></div>
		</div>
	</div>
	<div id="status" class="status">Loading PDF...</div>
<script nonce="${nonce}" type="module">
	import * as pdfjsLib from '${pdfJsUri}';
	import { EventBus, PDFLinkService, PDFViewer } from '${viewerUri}';
	const vscode = acquireVsCodeApi();

	const pdfBase64 = ${pdfPayload};
	const workerSrc = '${pdfWorkerUri}';
	const cMapUrl = '${cMapUri}/';
	const standardFontDataUrl = '${standardFontsUri}/';

	const statusEl = document.getElementById('status');
	const zoomValue = document.getElementById('zoomValue');
	const pageNumber = document.getElementById('pageNumber');
	const pageCount = document.getElementById('pageCount');
	const prevButton = document.getElementById('prevPage');
	const nextButton = document.getElementById('nextPage');
	const zoomInButton = document.getElementById('zoomIn');
	const zoomOutButton = document.getElementById('zoomOut');
	const fitWidthButton = document.getElementById('fitWidth');

	let pdfViewer;

	async function configureWorker() {
		try {
			const response = await fetch(workerSrc);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(blobUrl, { type: 'module' });
		} catch (err) {
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
		}
	}

	function updateZoomLabel(scale) {
		if (!Number.isFinite(scale)) {
			return;
		}
		zoomValue.textContent = Math.round(scale * 100) + '%';
	}

	function updateNav() {
		if (!pdfViewer) {
			return;
		}
		const total = pdfViewer.pagesCount || 1;
		const current = pdfViewer.currentPageNumber || 1;
		prevButton.disabled = current <= 1;
		nextButton.disabled = current >= total;
	}

	function decodeBase64ToBytes(base64) {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	async function loadPdf() {
		try {
			await configureWorker();
			const eventBus = new EventBus();
			const linkService = new PDFLinkService({ eventBus });
			const container = document.getElementById('viewerContainer');
			const viewer = document.getElementById('viewer');
			pdfViewer = new PDFViewer({
				container,
				viewer,
				eventBus,
				linkService
			});
			linkService.setViewer(pdfViewer);

			eventBus.on('pagesinit', () => {
				pageCount.textContent = '/ ' + (pdfViewer.pagesCount || 1);
				pageNumber.value = String(pdfViewer.currentPageNumber || 1);
				pdfViewer.currentScaleValue = 'page-width';
				updateZoomLabel(pdfViewer.currentScale);
				updateNav();
				statusEl.textContent = '';
			});

			eventBus.on('pagechanging', (evt) => {
				pageNumber.value = String(evt.pageNumber || 1);
				updateNav();
			});

			eventBus.on('scalechanging', (evt) => {
				updateZoomLabel(evt.scale);
			});

			const pdfBytes = decodeBase64ToBytes(pdfBase64);
			const loadingTask = pdfjsLib.getDocument({
				data: pdfBytes,
				cMapUrl,
				cMapPacked: true,
				standardFontDataUrl,
				useWasm: false,
				useWorkerFetch: false,
				isEvalSupported: false,
				disableStream: true,
				disableRange: true,
				disableAutoFetch: true,
				disableWorker: true
			});
			const pdfDoc = await loadingTask.promise;
			pdfViewer.setDocument(pdfDoc);
			linkService.setDocument(pdfDoc);
		} catch (err) {
			const message = err && err.message ? err.message : String(err);
			statusEl.textContent = 'Failed to load PDF: ' + message;
			vscode.postMessage({
				type: 'previewError',
				message,
				stack: err && err.stack ? err.stack : undefined
			});
			console.error(err);
		}
	}

	prevButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentPageNumber = Math.max(1, (pdfViewer.currentPageNumber || 1) - 1);
		}
	});

	nextButton.addEventListener('click', () => {
		if (pdfViewer) {
			const total = pdfViewer.pagesCount || 1;
			pdfViewer.currentPageNumber = Math.min(total, (pdfViewer.currentPageNumber || 1) + 1);
		}
	});

	pageNumber.addEventListener('change', () => {
		if (!pdfViewer) {
			return;
		}
		let value = Number.parseInt(pageNumber.value, 10);
		if (!Number.isFinite(value)) {
			value = pdfViewer.currentPageNumber || 1;
		}
		const total = pdfViewer.pagesCount || 1;
		value = Math.min(Math.max(value, 1), total);
		pdfViewer.currentPageNumber = value;
	});

	zoomInButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentScale = Math.min((pdfViewer.currentScale || 1) + 0.1, 4);
		}
	});

	zoomOutButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentScale = Math.max((pdfViewer.currentScale || 1) - 0.1, 0.2);
		}
	});

	fitWidthButton.addEventListener('click', () => {
		if (pdfViewer) {
			pdfViewer.currentScaleValue = 'page-width';
			updateZoomLabel(pdfViewer.currentScale);
		}
	});

	loadPdf();
</script>
</body>
</html>`;
	}

	private getPdfPreviewHtml(webview: vscode.Webview, viewPath: string): string {
		const csp = [
			"default-src 'none'",
			`frame-src ${webview.cspSource} blob:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`
		].join('; ');
		const pdfUri = webview.asWebviewUri(vscode.Uri.file(viewPath));
		const cacheBust = Date.now();
		return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${this.title}</title>
<style>
	body, html { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
	iframe { width: 100%; height: 100%; border: 0; background: #1e1e1e; }
</style>
</head>
<body>
<iframe src="${pdfUri}?v=${cacheBust}#toolbar=0&navpanes=0"></iframe>
</body>
</html>`;
	}

	private getImagePreviewHtml(webview: vscode.Webview, imagePath: string): string {
		const csp = [
			"default-src 'none'",
			`img-src ${webview.cspSource}`,
			`style-src ${webview.cspSource} 'unsafe-inline'`
		].join('; ');
		const imageUri = webview.asWebviewUri(vscode.Uri.file(imagePath));
		const cacheBust = Date.now();
		return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${this.title}</title>
<style>
	body, html { margin: 0; padding: 0; height: 100%; background: #1e1e1e; }
	.preview {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: #1e1e1e;
	}
	img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
</head>
<body>
<div class="preview">
	<img src="${imageUri}?v=${cacheBust}" alt="Preview PDF" />
</div>
</body>
</html>`;
	}

	private getStatusHtml(webview: vscode.Webview, status: PdfPreviewStatus): string {
		const csp = [
			"default-src 'none'",
			`style-src ${webview.cspSource} 'unsafe-inline'`
		].join('; ');
		const title = escapeHtml(status.title ?? this.title);
		const message = escapeHtml(status.message);
		const detail = escapeHtml(status.detail ?? '');
		const statusState = escapeHtml(status.state);
		const pathLine = status.path ? `<div class="path">${escapeHtml(status.path)}</div>` : '';
		return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
	body {
		margin: 0;
		font-family: "Segoe UI", Arial, sans-serif;
		background:
			radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 35%),
			radial-gradient(circle at top right, rgba(239, 68, 68, 0.14), transparent 34%),
			#111827;
		color: #e5e7eb;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		box-sizing: border-box;
	}
	.card {
		width: min(720px, 100%);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 18px;
		padding: 24px;
		background: rgba(17, 24, 39, 0.82);
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgba(226, 232, 240, 0.72);
	}
	h1 {
		margin: 10px 0 8px;
		font-size: 24px;
	}
	.state {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 12px;
		color: rgba(226, 232, 240, 0.88);
	}
	.state::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #94a3b8;
	}
	.state[data-state="waiting_for_build"]::before { background: #f59e0b; }
	.state[data-state="ready"]::before { background: #22c55e; }
	.state[data-state="build_error"]::before,
	.state[data-state="preview_error"]::before,
	.state[data-state="unavailable"]::before { background: #ef4444; }
	p {
		margin: 14px 0 0;
		line-height: 1.55;
		color: #cbd5e1;
	}
	.path, pre {
		margin-top: 14px;
		padding: 12px 14px;
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 12px;
		white-space: pre-wrap;
		word-break: break-word;
		color: #cbd5e1;
	}
</style>
</head>
<body>
	<section class="card">
		<div class="eyebrow">CO Preview</div>
		<h1>${message}</h1>
		<div class="state" data-state="${statusState}">${statusState}</div>
		${detail ? `<pre>${detail}</pre>` : ''}
		${pathLine}
	</section>
</body>
</html>`;
	}
	/* eslint-enable local/code-no-unexternalized-strings */

	private pickPreviewColumn(): vscode.ViewColumn {
		const hasOpenTabs = vscode.window.tabGroups.all.some(group => group.tabs.length > 0);
		if (!hasOpenTabs) {
			return vscode.ViewColumn.One;
		}
		return vscode.ViewColumn.Beside;
	}

	private async cleanupOldCopies(dir: string, keepPaths: Array<string | undefined>): Promise<void> {
		try {
			const keep = new Set(keepPaths.filter(Boolean) as string[]);
			const entries = await fs.readdir(dir);
			const targets = entries.filter(entry => entry.startsWith('preview_view_'));
			await Promise.all(targets.map(async entry => {
				const full = path.join(dir, entry);
				if (!keep.has(full)) {
					await fs.unlink(full).catch(() => undefined);
				}
			}));
		} catch {
			// best effort
		}
	}

	dispose(): void {
		this.panel?.dispose();
		if (this.lastViewPath) {
			void fs.unlink(this.lastViewPath).catch(() => undefined);
		}
		if (this.lastImagePath) {
			void fs.unlink(this.lastImagePath).catch(() => undefined);
		}
	}
}

function resolvePreviewMode(previewModeEnv: string | undefined, appName: string): PreviewMode {
	const envKey = previewModeEnv || 'CO_PDF_PREVIEW_MODE';
	const envMode = (process.env[envKey] ?? process.env.CO_TEMPLATE_GENERATOR_PREVIEW_MODE ?? '').trim().toLowerCase();
	const configuredMode = normalizePreviewMode(vscode.workspace.getConfiguration('co.preview').get<string>('mode'));
	if (envMode === 'pdfjs') {
		return 'pdfjs';
	}
	if (envMode === 'system' || envMode === 'custom') {
		return 'system';
	}
	if (envMode === 'image') {
		return 'image';
	}
	if (envMode === 'auto') {
		return 'auto';
	}
	if (configuredMode) {
		return configuredMode;
	}
	const lower = appName.toLowerCase();
	if (lower.includes('dev') || lower.includes('oss')) {
		return 'pdfjs';
	}
	return 'auto';
}

function normalizePreviewMode(value: string | undefined): PreviewMode | undefined {
	switch ((value ?? '').trim().toLowerCase()) {
		case 'pdfjs':
			return 'pdfjs';
		case 'system':
		case 'custom':
			return 'system';
		case 'image':
			return 'image';
		case 'auto':
			return 'auto';
		default:
			return undefined;
	}
}

function mapStatusReason(state: PdfPreviewState): PreviewReasonCode | undefined {
	switch (state) {
		case 'waiting_for_build':
			return 'pdf_not_found';
		case 'preview_error':
		case 'build_error':
		case 'unavailable':
			return 'pdf_unreadable';
		default:
			return undefined;
	}
}

function shouldPreferPdfJs(appName: string): boolean {
	const lower = appName.toLowerCase();
	return lower.includes('dev') || lower.includes('oss');
}

async function resolvePdfJsRoot(searchRoots: string[]): Promise<string | undefined> {
	const roots = searchRoots.length ? searchRoots : [process.cwd()];
	for (const root of roots) {
		const found = await findPdfJsRoot(root);
		if (found) {
			return found;
		}
	}
	return undefined;
}

async function findPdfJsRoot(startDir: string): Promise<string | undefined> {
	let current = startDir;
	for (let depth = 0; depth < 7; depth += 1) {
		const candidate = path.join(current, 'node_modules', 'pdfjs-dist');
		if (await fileExists(path.join(candidate, 'package.json'))) {
			return candidate;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i += 1) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
