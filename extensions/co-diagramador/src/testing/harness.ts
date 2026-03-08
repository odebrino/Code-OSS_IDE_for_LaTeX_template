/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import * as fsSync from 'fs';
import fs from 'fs/promises';
import type { TemplatePackage } from 'co-template-core';
import { parseProject } from 'co-doc-core';
import type { PreviewOpenResult } from 'co-preview-core';
import type { DiagramadorHostUi } from '../hostUi';
import type { DiagramadorHostMessage, DiagramadorState, DiagramadorStatus, DiagramadorWebviewMessage } from '../protocol';

type BuildOutcome = {
	ok: boolean;
	friendly?: string;
	notFound?: boolean;
	stdout?: string;
	stderr?: string;
};

type BuildScope = 'document' | 'template';

type BuildRequest = {
	template: TemplatePackage;
	previewData: Record<string, any>;
	outDir: string;
	fast?: boolean;
};

type BuildServiceFactoryOptions = {
	debounceMs?: number;
	onStatus?: (status: DiagramadorStatus) => void;
	onComplete?: (result: {
		ok: boolean;
		stdout: string;
		stderr: string;
		friendly: string;
		notFound: boolean;
		pdfPath: string;
		logPath: string;
		texPath: string;
	}) => void;
};

type PreviewCall = {
	scope: BuildScope;
	method: 'open' | 'refresh' | 'showStatus';
	path: string;
	message?: string;
};

type DiagramadorControllerLike = {
	getState(): DiagramadorState;
	handleMessage(message: DiagramadorWebviewMessage | unknown, webview?: Pick<vscode.Webview, 'postMessage'>): Promise<void>;
	open(): Promise<void>;
};

type FakeUiState = {
	confirmResults: boolean[];
	inputResults: Array<string | undefined>;
	quickPickIndexes: number[];
	openDialogResults: Array<string[] | undefined>;
	saveDialogResults: Array<string | undefined>;
	warnings: string[];
	infos: string[];
	errors: string[];
};

class FakeHostUi implements DiagramadorHostUi {
	readonly state: FakeUiState = {
		confirmResults: [],
		inputResults: [],
		quickPickIndexes: [],
		openDialogResults: [],
		saveDialogResults: [],
		warnings: [],
		infos: [],
		errors: []
	};

	queueConfirmResult(accepted: boolean) {
		this.state.confirmResults.push(accepted);
	}

	queueInputResult(value: string | undefined) {
		this.state.inputResults.push(value);
	}

	queueQuickPickIndex(index: number) {
		this.state.quickPickIndexes.push(index);
	}

	queueOpenDialogResult(paths: string[] | undefined) {
		this.state.openDialogResults.push(paths);
	}

	queueSaveDialogResult(targetPath: string | undefined) {
		this.state.saveDialogResults.push(targetPath);
	}

	async showWarningMessage(message: string, _options: vscode.MessageOptions | undefined, ...items: string[]): Promise<string | undefined> {
		this.state.warnings.push(message);
		if (!items.length) {
			return undefined;
		}
		const accepted = this.state.confirmResults.length ? this.state.confirmResults.shift()! : true;
		return accepted ? items[0] : items[1];
	}

	async showInputBox(_options: vscode.InputBoxOptions): Promise<string | undefined> {
		return this.state.inputResults.length ? this.state.inputResults.shift() : undefined;
	}

	async showQuickPick<T extends vscode.QuickPickItem>(items: readonly T[], _options: vscode.QuickPickOptions): Promise<T | undefined> {
		if (!items.length) {
			return undefined;
		}
		const index = this.state.quickPickIndexes.length ? this.state.quickPickIndexes.shift()! : 0;
		return items[Math.max(0, Math.min(index, items.length - 1))];
	}

	async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
		this.state.infos.push(message);
		if (!items.length) {
			return undefined;
		}
		const accepted = this.state.confirmResults.length ? this.state.confirmResults.shift()! : true;
		return accepted ? items[0] : items[1];
	}

	async showErrorMessage(message: string, ..._items: string[]): Promise<string | undefined> {
		this.state.errors.push(message);
		return undefined;
	}

	async showOpenDialog(_options: vscode.OpenDialogOptions): Promise<readonly vscode.Uri[] | undefined> {
		const next = this.state.openDialogResults.length ? this.state.openDialogResults.shift() : undefined;
		return next?.map(filePath => vscode.Uri.file(filePath));
	}

	async showSaveDialog(_options: vscode.SaveDialogOptions): Promise<vscode.Uri | undefined> {
		const next = this.state.saveDialogResults.length ? this.state.saveDialogResults.shift() : undefined;
		return next ? vscode.Uri.file(next) : undefined;
	}
}

class FakeBuildService implements vscode.Disposable {
	constructor(
		private readonly scope: BuildScope,
		private readonly options: BuildServiceFactoryOptions,
		private readonly requests: Map<BuildScope, BuildRequest>,
		private readonly outcomes: Map<BuildScope, BuildOutcome>
	) { }

	schedule(request: BuildRequest) {
		this.requests.set(this.scope, request);
		this.options.onStatus?.({ state: 'building', message: 'Gerando PDF...' });
		this.complete(request);
	}

	private complete(request: BuildRequest) {
		const outcome = this.outcomes.get(this.scope) ?? {
			ok: false,
			friendly: 'Nao encontrei o Tectonic. Instale o Tectonic para gerar o PDF.',
			notFound: true
		};
		fsSync.mkdirSync(request.outDir, { recursive: true });
		const pdfPath = path.join(request.outDir, 'preview.pdf');
		const logPath = path.join(request.outDir, 'build.log');
		const texPath = path.join(request.outDir, 'main.tex');
		fsSync.writeFileSync(texPath, '% fake tex\n', 'utf8');
		fsSync.writeFileSync(logPath, outcome.friendly ?? '', 'utf8');
		if (outcome.ok) {
			fsSync.writeFileSync(pdfPath, 'fake pdf', 'utf8');
			this.options.onStatus?.({ state: 'success', message: 'PDF atualizado.' });
		} else {
			this.options.onStatus?.({ state: 'error', message: outcome.friendly ?? 'Falha ao gerar PDF.' });
		}
		this.options.onComplete?.({
			ok: outcome.ok,
			stdout: outcome.stdout ?? '',
			stderr: outcome.stderr ?? '',
			friendly: outcome.friendly ?? '',
			notFound: outcome.notFound ?? false,
			pdfPath,
			logPath,
			texPath
		});
	}

	dispose() {
		// no-op
	}
}

class FakePreviewManager implements vscode.Disposable {
	constructor(
		private readonly scope: BuildScope,
		private readonly calls: PreviewCall[]
	) { }

	async open(previewPdfPath: string): Promise<PreviewOpenResult> {
		this.calls.push({ scope: this.scope, method: 'open', path: previewPdfPath });
		return {
			ok: true,
			modeUsed: 'system',
			message: 'fake preview open',
			details: [],
			state: 'ready'
		};
	}

	async refresh(previewPdfPath: string): Promise<PreviewOpenResult> {
		this.calls.push({ scope: this.scope, method: 'refresh', path: previewPdfPath });
		return {
			ok: true,
			modeUsed: 'system',
			message: 'fake preview refresh',
			details: [],
			state: 'ready'
		};
	}

	async showStatus(status: {
		state: 'idle' | 'waiting_for_build' | 'ready' | 'build_error' | 'preview_error' | 'unavailable';
		message: string;
		detail?: string;
		title?: string;
		path?: string;
	}): Promise<PreviewOpenResult> {
		this.calls.push({ scope: this.scope, method: 'showStatus', path: status.path ?? '', message: status.message });
		return {
			ok: status.state === 'ready',
			modeUsed: 'status',
			message: status.message,
			details: status.detail ? [status.detail] : [],
			state: status.state
		};
	}

	dispose() {
		// no-op
	}
}

export type DiagramadorTestApi = {
	getStateSnapshot(): DiagramadorState;
	dispatchMessage(message: DiagramadorWebviewMessage): Promise<DiagramadorHostMessage[]>;
	open(): Promise<void>;
	queueConfirmResult(accepted: boolean): void;
	queueInputResult(value: string | undefined): void;
	queueQuickPickIndex(index: number): void;
	queueOpenDialogResult(paths: string[] | undefined): void;
	queueSaveDialogResult(targetPath: string | undefined): void;
	setBuildOutcome(scope: BuildScope, outcome: BuildOutcome): void;
	getLastBuildRequest(scope: BuildScope): BuildRequest | undefined;
	getPreviewCalls(): PreviewCall[];
	listTaskFiles(): Promise<string[]>;
	readTask(taskId: string): Promise<ReturnType<typeof parseProject>>;
	readTemplateManifest(templateId: string): Promise<Record<string, any> | undefined>;
	getUiMessages(): { warnings: string[]; infos: string[]; errors: string[] };
};

export function createDiagramadorTestingHarness(context: vscode.ExtensionContext): {
	dependencies: {
		ui: DiagramadorHostUi;
		createBuildService: (scope: BuildScope, options: BuildServiceFactoryOptions) => vscode.Disposable & { schedule(request: BuildRequest): void };
		createPreviewManager: (scope: BuildScope, _output: vscode.OutputChannel, _options: {
			extensionRoot: string;
			appName: string;
			title: string;
			viewType: string;
		}) => vscode.Disposable & {
			open(previewPdfPath: string): Promise<PreviewOpenResult>;
			refresh(previewPdfPath: string): Promise<PreviewOpenResult>;
			showStatus(status: {
				state: 'idle' | 'waiting_for_build' | 'ready' | 'build_error' | 'preview_error' | 'unavailable';
				message: string;
				detail?: string;
				title?: string;
				path?: string;
			}): Promise<PreviewOpenResult>;
		};
	};
	createApi(controller: DiagramadorControllerLike): DiagramadorTestApi;
} {
	const ui = new FakeHostUi();
	const buildRequests = new Map<BuildScope, BuildRequest>();
	const buildOutcomes = new Map<BuildScope, BuildOutcome>();
	const previewCalls: PreviewCall[] = [];

	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const diagramadorBaseDir = workspaceRoot
		? path.join(workspaceRoot, '.co', 'diagramador')
		: path.join(context.globalStorageUri.fsPath, 'diagramador');
	const templateStorageDir = path.join(path.dirname(context.globalStorageUri.fsPath), 'co-template-core', 'templates');

	return {
		dependencies: {
			ui,
			createBuildService: (scope, options) => new FakeBuildService(scope, options, buildRequests, buildOutcomes),
			createPreviewManager: (scope) => new FakePreviewManager(scope, previewCalls)
		},
		createApi(controller) {
			return {
				getStateSnapshot() {
					return controller.getState();
				},
				async dispatchMessage(message) {
					const postedMessages: DiagramadorHostMessage[] = [];
					const fakeWebview = {
						postMessage: async (payload: DiagramadorHostMessage) => {
							postedMessages.push(payload);
							return true;
						}
					} satisfies Pick<vscode.Webview, 'postMessage'>;
					await controller.handleMessage(message, fakeWebview);
					return postedMessages;
				},
				async open() {
					await controller.open();
				},
				queueConfirmResult(accepted) {
					ui.queueConfirmResult(accepted);
				},
				queueInputResult(value) {
					ui.queueInputResult(value);
				},
				queueQuickPickIndex(index) {
					ui.queueQuickPickIndex(index);
				},
				queueOpenDialogResult(paths) {
					ui.queueOpenDialogResult(paths);
				},
				queueSaveDialogResult(targetPath) {
					ui.queueSaveDialogResult(targetPath);
				},
				setBuildOutcome(scope, outcome) {
					buildOutcomes.set(scope, outcome);
				},
				getLastBuildRequest(scope) {
					return buildRequests.get(scope);
				},
				getPreviewCalls() {
					return previewCalls.slice();
				},
				async listTaskFiles() {
					const tasksDir = path.join(diagramadorBaseDir, 'tarefas');
					try {
						const entries = await fs.readdir(tasksDir, { withFileTypes: true });
						return entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
					} catch {
						return [];
					}
				},
				async readTask(taskId) {
					const target = path.join(diagramadorBaseDir, 'tarefas', `${taskId}.json`);
					try {
						return parseProject(await fs.readFile(target, 'utf8'));
					} catch {
						return null;
					}
				},
				async readTemplateManifest(templateId) {
					const target = path.join(templateStorageDir, templateId, 'template.json');
					if (!fsSync.existsSync(target)) {
						return undefined;
					}
					return JSON.parse(await fs.readFile(target, 'utf8')) as Record<string, any>;
				},
				getUiMessages() {
					return {
						warnings: ui.state.warnings.slice(),
						infos: ui.state.infos.slice(),
						errors: ui.state.errors.slice()
					};
				}
			};
		}
	};
}
