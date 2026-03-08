/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs/promises';
import { migrateLegacyProject, parseProject } from 'co-doc-core';
import { isExecutableCommandSnap } from 'co-storage-core';
import { scanTemplateStorage } from 'co-template-core';
import { DataSetItemSummary, DataSetState, registerDataSetView } from './webview';
import { collectWatchDirs, resolveDataSetScanRoots, ScanRoot } from './scanRoots';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type DataSetItemType = 'project' | 'task' | 'template' | 'pdf' | 'log';
type DataSetLocation = 'workspace' | 'global';

type DataSetItem = {
	id: string;
	name: string;
	type: DataSetItemType;
	location: DataSetLocation;
	sourcePath: string;
	openPath: string;
	pathLabel: string;
	detail?: string;
};

const TASKS_DIR_NAME = 'tarefas';
const PREVIEW_VIEW_PREFIX = 'preview_view_';
const SCAN_DEBOUNCE_MS = 450;
const STATUS_THROTTLE_MS = 300;
const MAX_SCAN_DEPTH = 6;
const MAX_RESULTS = 2000;
const IGNORED_DIRS = new Set<string>([
	'.git',
	'.idea',
	'.vscode',
	'node_modules',
	'out',
	'out-build',
	'out-vscode',
	'build',
	'dist'
]);

export async function activate(context: vscode.ExtensionContext): Promise<void | {
	__test: {
		getStateSnapshot: () => DataSetState;
		refresh: () => Promise<void>;
		getRootsSnapshot: () => Array<{
			id: string;
			label: string;
			diagramadorDir?: string;
			runtimeDirs: string[];
			templateDirs: string[];
		}>;
	};
}> {
	let roots = await refreshRoots();
	let items: DataSetItem[] = [];
	const itemById = new Map<string, DataSetItem>();
	let scanTimer: NodeJS.Timeout | undefined;
	let scanTokenSource: vscode.CancellationTokenSource | undefined;
	let scanCounter = 0;
	let lastStatusAt = 0;
	const watchers = new Map<string, vscode.FileSystemWatcher>();

	const viewProvider = registerDataSetView(context, message => onMessage(message), () => getState(), () => {
		scheduleRefresh('visible');
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('co.dataSet.open', async () => {
			await vscode.commands.executeCommand('workbench.view.extension.co-data-set');
			viewProvider.show();
		}),
		vscode.commands.registerCommand('co.dataSet.refresh', async () => {
			await refreshItems('manual');
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void reloadRoots('workspace');
		})
	);

	await ensureWatchers();
	await refreshItems('startup');

	if (process.env.CO_TESTING === '1') {
		return {
			__test: {
				getStateSnapshot: () => getState(),
				refresh: async () => refreshItems('test'),
				getRootsSnapshot: () => roots.map(root => ({
					id: root.id,
					label: root.label,
					diagramadorDir: root.diagramadorDir,
					runtimeDirs: root.runtimeDirs.slice(),
					templateDirs: root.templateDirs.slice()
				}))
			}
		};
	}

	return undefined;

	function getState(): DataSetState {
		return {
			roots: roots.map(root => root.label),
			items: items.map(toSummary)
		};
	}

	function toSummary(item: DataSetItem): DataSetItemSummary {
		return {
			id: item.id,
			name: item.name,
			type: item.type,
			location: item.location,
			pathLabel: item.pathLabel,
			detail: item.detail,
			canOpen: Boolean(item.openPath)
		};
	}

	function scheduleRefresh(reason: string) {
		if (scanTimer) {
			clearTimeout(scanTimer);
		}
		scanTimer = setTimeout(() => {
			void refreshItems(reason);
		}, SCAN_DEBOUNCE_MS);
	}

	async function refreshItems(reason: string): Promise<void> {
		scanCounter += 1;
		const scanId = scanCounter;
		if (scanTokenSource) {
			scanTokenSource.cancel();
			scanTokenSource.dispose();
		}
		scanTokenSource = new vscode.CancellationTokenSource();
		const token = scanTokenSource.token;
		viewProvider.sendStatus({ state: 'scanning', message: `Atualizando (${reason})...` });
		const nextItems = await scanRoots(roots, token, progress => {
			const now = Date.now();
			if (now - lastStatusAt < STATUS_THROTTLE_MS) {
				return;
			}
			lastStatusAt = now;
			viewProvider.sendStatus({ state: 'scanning', message: `Escaneando... ${progress}` });
		});
		if (token.isCancellationRequested || scanId !== scanCounter) {
			return;
		}
		items = nextItems;
		itemById.clear();
		for (const item of items) {
			itemById.set(item.id, item);
		}
		viewProvider.sendState(getState());
		viewProvider.sendStatus({ state: 'ready', message: `${items.length} itens` });
		await ensureWatchers();
	}

	async function onMessage(message: { type?: string;[key: string]: JsonValue | undefined }): Promise<void> {
		switch (message.type) {
			case 'openItem': {
				if (typeof message.id === 'string') {
					await openItem(message.id);
				}
				break;
			}
			case 'refresh': {
				scheduleRefresh('manual');
				break;
			}
			case 'requestState': {
				viewProvider.sendState(getState());
				break;
			}
		}
	}

	async function openItem(id: string): Promise<void> {
		const item = itemById.get(id);
		if (!item) {
			viewProvider.sendStatus({ state: 'error', message: 'Arquivo nao encontrado.' });
			return;
		}
		const uri = vscode.Uri.file(item.openPath);
		await vscode.commands.executeCommand('vscode.open', uri, {
			viewColumn: vscode.ViewColumn.Beside,
			preview: true
		});
	}

	async function reloadRoots(reason: string) {
		roots = await refreshRoots();
		await ensureWatchers();
		viewProvider.sendState(getState());
		scheduleRefresh(reason);
	}

	async function refreshRoots(): Promise<ScanRoot[]> {
		return resolveDataSetScanRoots({
			workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(folder => ({
				name: folder.name,
				fsPath: folder.uri.fsPath
			})),
			globalStoragePath: context.globalStorageUri.fsPath,
			appName: vscode.env.appName,
			configuredRuntimeBaseDir: vscode.workspace.getConfiguration('co.runtime').get<string>('baseDir'),
			envRuntimeBaseDir: process.env.CO_RUNTIME_BASE_DIR,
			saveDirOverride: process.env.CO_SAVE_DIR,
			platform: process.platform,
			isSnapTectonic: await isSnapTectonicCommand()
		});
	}

	async function ensureWatchers() {
		const nextWatchDirs = new Set<string>();
		for (const dir of collectWatchDirs(roots)) {
			if (!await fileExists(dir)) {
				continue;
			}
			nextWatchDirs.add(dir);
			if (watchers.has(dir)) {
				continue;
			}
			const pattern = new vscode.RelativePattern(vscode.Uri.file(dir), '**/*');
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			watcher.onDidChange(() => scheduleRefresh('watch'));
			watcher.onDidCreate(() => scheduleRefresh('watch'));
			watcher.onDidDelete(() => scheduleRefresh('watch'));
			watchers.set(dir, watcher);
			context.subscriptions.push(watcher);
		}
		for (const [dir, watcher] of watchers) {
			if (nextWatchDirs.has(dir)) {
				continue;
			}
			watcher.dispose();
			watchers.delete(dir);
		}
	}
}

async function scanRoots(
	roots: ScanRoot[],
	token: vscode.CancellationToken,
	onProgress: (message: string) => void
): Promise<DataSetItem[]> {
	const results: DataSetItem[] = [];
	const seen = new Set<string>();
	let count = 0;

	for (const root of roots) {
		if (token.isCancellationRequested) {
			break;
		}
		if (root.diagramadorDir) {
			await scanDiagramadorRoot(root, results, seen, token, () => {
				count += 1;
				onProgress(`${count} itens`);
			});
		}
		if (token.isCancellationRequested) {
			break;
		}
		if (root.templateDirs.length) {
			await scanTemplatesRoot(root, results, seen, token, () => {
				count += 1;
				onProgress(`${count} itens`);
			});
		}
	}

	return results;
}

async function scanDiagramadorRoot(
	root: ScanRoot,
	results: DataSetItem[],
	seen: Set<string>,
	token: vscode.CancellationToken,
	onItem: () => void
): Promise<void> {
	if (!root.diagramadorDir || !await fileExists(root.diagramadorDir)) {
		return;
	}
	const projectPath = path.join(root.diagramadorDir, 'project.json');
	if (await fileExists(projectPath)) {
		const project = await readProject(projectPath);
		const name = getProjectLabel(project, 'Projeto');
		pushItem(results, seen, {
			id: makeItemId('project', root.location, projectPath),
			name,
			type: 'project',
			location: root.location,
			sourcePath: projectPath,
			openPath: projectPath,
			pathLabel: formatPathLabel(root, projectPath),
			detail: project?.templateId ? `Template: ${project.templateId}` : undefined
		});
		onItem();
		if (results.length >= MAX_RESULTS) {
			return;
		}
	}

	const tasksDir = path.join(root.diagramadorDir, TASKS_DIR_NAME);
	if (await fileExists(tasksDir)) {
		const taskEntries = await safeReadDir(tasksDir);
		for (const entry of taskEntries) {
			if (token.isCancellationRequested || results.length >= MAX_RESULTS) {
				return;
			}
			if (!entry.isFile() || !entry.name.endsWith('.json')) {
				continue;
			}
			const taskPath = path.join(tasksDir, entry.name);
			const project = await readProject(taskPath);
			const name = getProjectLabel(project, entry.name.replace(/\.json$/i, ''));
			pushItem(results, seen, {
				id: makeItemId('task', root.location, taskPath),
				name,
				type: 'task',
				location: root.location,
				sourcePath: taskPath,
				openPath: taskPath,
				pathLabel: formatPathLabel(root, taskPath),
				detail: project?.templateId ? `Template: ${project.templateId}` : undefined
			});
			onItem();
		}
	}

	for (const dir of root.runtimeDirs) {
		if (token.isCancellationRequested || results.length >= MAX_RESULTS) {
			return;
		}
		if (!await fileExists(dir)) {
			continue;
		}
		const pdfs = await findPdfs(dir, MAX_SCAN_DEPTH, token);
		for (const pdf of pdfs) {
			if (token.isCancellationRequested || results.length >= MAX_RESULTS) {
				return;
			}
			if (path.basename(pdf).startsWith(PREVIEW_VIEW_PREFIX)) {
				continue;
			}
			pushItem(results, seen, {
				id: makeItemId('pdf', root.location, pdf),
				name: path.basename(pdf),
				type: 'pdf',
				location: root.location,
				sourcePath: pdf,
				openPath: pdf,
				pathLabel: formatPathLabel(root, pdf)
			});
			onItem();
		}
		const logPath = path.join(dir, 'build.log');
		if (await fileExists(logPath)) {
			pushItem(results, seen, {
				id: makeItemId('log', root.location, logPath),
				name: path.basename(logPath),
				type: 'log',
				location: root.location,
				sourcePath: logPath,
				openPath: logPath,
				pathLabel: formatPathLabel(root, logPath)
			});
			onItem();
		}
	}
}

async function scanTemplatesRoot(
	root: ScanRoot,
	results: DataSetItem[],
	seen: Set<string>,
	token: vscode.CancellationToken,
	onItem: () => void
): Promise<void> {
	for (const templateDir of root.templateDirs) {
		if (!await fileExists(templateDir)) {
			continue;
		}
		const scan = await scanTemplateStorage(templateDir);
		for (const template of scan.templates) {
			if (token.isCancellationRequested || results.length >= MAX_RESULTS) {
				return;
			}
			const manifestPath = path.join(template.path, 'template.json');
			pushItem(results, seen, {
				id: makeItemId('template', root.location, template.path),
				name: template.name,
				type: 'template',
				location: root.location,
				sourcePath: template.path,
				openPath: manifestPath,
				pathLabel: formatPathLabel(root, template.path),
				detail: template.version ? `v${template.version}` : undefined
			});
			onItem();
		}
	}
}

function pushItem(results: DataSetItem[], seen: Set<string>, item: DataSetItem) {
	const key = `${item.type}:${item.sourcePath}`;
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	results.push(item);
}

function makeItemId(type: DataSetItemType, location: DataSetLocation, sourcePath: string): string {
	return `${type}:${location}:${sourcePath}`;
}

async function findPdfs(dir: string, maxDepth: number, token: vscode.CancellationToken): Promise<string[]> {
	const results: string[] = [];
	const queue: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }];
	while (queue.length) {
		if (token.isCancellationRequested) {
			break;
		}
		const current = queue.shift();
		if (!current) {
			continue;
		}
		if (current.depth > maxDepth) {
			continue;
		}
		const entries = await safeReadDir(current.dir);
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name)) {
					continue;
				}
				queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
				continue;
			}
			if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
				results.push(path.join(current.dir, entry.name));
				if (results.length >= MAX_RESULTS) {
					return results;
				}
			}
		}
	}
	return results;
}

async function readProject(filePath: string): Promise<{ templateId?: string; data?: Record<string, any> } | null> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		const parsed = parseProject(raw);
		if (parsed) {
			return parsed;
		}
		const legacy = JSON.parse(raw) as Record<string, any>;
		if (isPlainObject(legacy) && !Object.prototype.hasOwnProperty.call(legacy, 'schemaVersion')) {
			return migrateLegacyProject(legacy);
		}
	} catch {
		return null;
	}
	return null;
}

function getProjectLabel(project: { data?: Record<string, any> } | null, fallback: string): string {
	const data = isPlainObject(project?.data) ? project?.data : {};
	const taskNumber = normalizeLabel(pickDataValue(data, ['TaskNumber', 'taskNumber']));
	if (taskNumber && taskNumber.toUpperCase() !== 'XX') {
		return `Tarefa ${taskNumber}`;
	}
	const title = normalizeLabel(pickDataValue(data, ['title', 'Title', 'TaskTitle']));
	if (title) {
		return title;
	}
	const model = normalizeLabel(pickDataValue(data, ['model', 'Model']));
	if (model) {
		return model;
	}
	return fallback;
}

function normalizeLabel(value: string | null | undefined): string {
	if (value === null || value === undefined) {
		return '';
	}
	return String(value).trim();
}

function pickDataValue(data: Record<string, any>, keys: string[]): string | undefined {
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(data, key)) {
			const value = data[key];
			if (value !== null && value !== undefined) {
				return String(value);
			}
		}
	}
	return undefined;
}

function formatPathLabel(root: ScanRoot, targetPath: string): string {
	const rel = path.relative(root.baseDir, targetPath);
	const formatted = rel && !rel.startsWith('..') ? rel : targetPath;
	return `${root.label} • ${formatted}`;
}

async function safeReadDir(dir: string): Promise<Array<import('fs').Dirent>> {
	try {
		return await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

function isPlainObject(value: any): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function isSnapTectonicCommand(): Promise<boolean> {
	const configured = (process.env.TECTONIC_PATH ?? '').trim();
	if (configured.includes('/snap/')) {
		return true;
	}
	return isExecutableCommandSnap('tectonic');
}
