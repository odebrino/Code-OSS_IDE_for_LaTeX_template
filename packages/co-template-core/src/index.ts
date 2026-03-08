/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
import { constants as fsConstants } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export type TemplateFieldType = 'string' | 'string[]' | 'number' | 'boolean' | 'latex';

export type TemplateFieldSchema = {
	key: string;
	type: TemplateFieldType;
	label: string;
};

export type TemplateManifest = {
	id: string;
	name: string;
	version: string;
	description: string;
	entry: 'main.tex';
	schema: TemplateFieldSchema[];
	defaults?: Record<string, any>;
};

export type TemplateSummary = {
	id: string;
	name: string;
	version: string;
	description: string;
	path: string;
	readOnly?: boolean;
};

export type TemplatePackage = {
	manifest: TemplateManifest;
	dir: string;
	entryPath: string;
	assetsDir: string;
	mainTex: string;
	previewData: Record<string, any>;
	readOnly: boolean;
};

export type TemplateStoragePaths = {
	primaryDir: string;
	fallbackDir?: string;
};

type TemplateStorageInput = TemplateStoragePaths | string;

export type TemplateLoadIssueCode =
	| 'manifest_missing'
	| 'manifest_unreadable'
	| 'manifest_invalid'
	| 'entry_missing'
	| 'preview_data_unreadable';

export type TemplateLoadIssue = {
	id: string;
	dir: string;
	readOnly: boolean;
	code: TemplateLoadIssueCode;
	path: string;
	message: string;
};

export type TemplateScanResult = {
	templates: TemplateSummary[];
	issues: TemplateLoadIssue[];
};

export type TemplateValidationResult = {
	ok: boolean;
	errors: string[];
	warnings: string[];
};

export type TemplateBuildStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
};

export type BuildFailureCode =
	| 'tectonic_not_found'
	| 'tectonic_spawn_error'
	| 'input_unreadable'
	| 'outdir_unreadable'
	| 'outdir_unwritable'
	| 'bundle_unreadable'
	| 'asset_sync_error'
	| 'latex_compile_error'
	| 'pdf_missing_after_success'
	| 'unknown_build_error';

export type TemplateBuildDiagnostics = {
	command: string;
	commandPath?: string;
	args: string[];
	cwd: string;
	texPath: string;
	texPathReal?: string;
	dataTexPath?: string;
	dataTexPathReal?: string;
	outDir: string;
	outDirReal?: string;
	bundlePath?: string;
	bundlePathReal?: string;
	assetsDir?: string;
	assetsDirReal?: string;
	stdoutTail?: string;
	stderrTail?: string;
	platform: NodeJS.Platform;
	isSnapTectonic: boolean;
	storageBaseDir: string;
	storageBaseDirReal?: string;
};

export type TemplateBuildResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
	friendly: string;
	notFound: boolean;
	pdfPath: string;
	logPath: string;
	texPath: string;
	failureCode?: BuildFailureCode;
	diagnostics?: TemplateBuildDiagnostics;
};

type InternalBuildResult = Omit<TemplateBuildResult, 'pdfPath' | 'logPath' | 'texPath'>;

export type TemplateBuildRequest = {
	template: TemplatePackage;
	previewData: Record<string, any>;
	outDir: string;
	fast?: boolean;
};

export type BuildPreviewOptions = {
	onProcess?: (child: ChildProcess) => void;
	fast?: boolean;
};

export type TemplateBuildFailureDescription = {
	summary: string;
	detail?: string;
	technicalDetails: Array<{ label: string; value: string }>;
};

const DEFAULT_SHARED_STORAGE = 'co-template-core';
const PREVIEW_TEX_NAME = 'main.tex';
const DATA_TEX_NAME = 'co_data.tex';

export async function resolveTectonicBundlePath(options: {
	configuredPath?: string;
	globalStoragePath?: string;
	env?: NodeJS.ProcessEnv;
	cacheRoot?: string;
}): Promise<string | undefined> {
	const env = options.env ?? process.env;
	const envBundle = normalizeOptionalPath(env.CO_TECTONIC_BUNDLE) ?? normalizeOptionalPath(env.TECTONIC_BUNDLE);
	const fromEnv = await pickExistingPath(envBundle);
	if (fromEnv) {
		return fromEnv;
	}
	const fromConfig = await pickExistingPath(options.configuredPath);
	if (fromConfig) {
		return fromConfig;
	}
	if (options.globalStoragePath) {
		const storageBundle = path.join(options.globalStoragePath, 'tectonic.bundle');
		if (await fileExists(storageBundle)) {
			return storageBundle;
		}
	}
	const cacheRoot = options.cacheRoot ?? process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
	const cached = await findBundleInCache(cacheRoot);
	if (!cached) {
		return undefined;
	}
	if (options.globalStoragePath) {
		const storageBundle = path.join(options.globalStoragePath, 'tectonic.bundle');
		try {
			await fs.mkdir(options.globalStoragePath, { recursive: true });
			await fs.copyFile(cached, storageBundle);
			return storageBundle;
		} catch {
			return cached;
		}
	}
	return cached;
}

export function resolveTemplateStoragePaths(globalStoragePath: string, repoRoot?: string): TemplateStoragePaths {
	const sharedRoot = path.join(path.dirname(globalStoragePath), DEFAULT_SHARED_STORAGE);
	const primaryDir = path.join(sharedRoot, 'templates');
	const fallbackDir = repoRoot ? path.join(repoRoot, 'templates') : undefined;
	return { primaryDir, fallbackDir };
}

function normalizeStorage(storage: TemplateStorageInput, fallbackDir?: string): TemplateStoragePaths {
	if (typeof storage === 'string') {
		return { primaryDir: storage, fallbackDir };
	}
	return storage;
}

export async function listTemplates(storage: TemplateStorageInput, fallbackDir?: string): Promise<TemplateSummary[]> {
	const scanned = await scanTemplateStorage(storage, fallbackDir);
	return scanned.templates;
}

export async function scanTemplateStorage(storage: TemplateStorageInput, fallbackDir?: string): Promise<TemplateScanResult> {
	const resolved = normalizeStorage(storage, fallbackDir);
	const summaries = new Map<string, TemplateSummary>();
	const issues: TemplateLoadIssue[] = [];
	const primary = await scanTemplatesFromDir(resolved.primaryDir, false);
	for (const summary of primary.templates) {
		summaries.set(summary.id, summary);
	}
	issues.push(...primary.issues);
	if (resolved.fallbackDir) {
		const fallback = await scanTemplatesFromDir(resolved.fallbackDir, true);
		for (const summary of fallback.templates) {
			if (!summaries.has(summary.id)) {
				summaries.set(summary.id, summary);
			}
		}
		issues.push(...fallback.issues);
	}
	return {
		templates: Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name)),
		issues
	};
}

export async function loadTemplate(storage: TemplateStorageInput, id: string, fallbackDir?: string): Promise<TemplatePackage | undefined> {
	const resolved = normalizeStorage(storage, fallbackDir);
	const trimmed = id.trim();
	if (!trimmed) {
		return undefined;
	}
	const primary = await loadTemplateFromDir(resolved.primaryDir, trimmed, false);
	if (primary) {
		return primary;
	}
	if (resolved.fallbackDir) {
		return loadTemplateFromDir(resolved.fallbackDir, trimmed, true);
	}
	return undefined;
}

export async function saveTemplate(storage: TemplateStorageInput, template: {
	manifest: TemplateManifest;
	mainTex: string;
	previewData?: Record<string, any>;
}): Promise<TemplatePackage> {
	const resolved = normalizeStorage(storage);
	const manifest = template.manifest;
	const validation = validateTemplate(manifest);
	if (!validation.ok) {
		throw new Error(`Template manifest invalido: ${validation.errors.join('; ')}`);
	}
	const templateDir = path.join(resolved.primaryDir, manifest.id);
	const assetsDir = path.join(templateDir, 'assets');
	await fs.mkdir(assetsDir, { recursive: true });
	await fs.writeFile(path.join(templateDir, 'template.json'), JSON.stringify(manifest, null, 2), 'utf8');
	await fs.writeFile(path.join(templateDir, manifest.entry), template.mainTex, 'utf8');
	const previewData = template.previewData ?? {};
	await fs.writeFile(path.join(templateDir, 'preview_data.json'), JSON.stringify(previewData, null, 2), 'utf8');
	return {
		manifest,
		dir: templateDir,
		entryPath: path.join(templateDir, manifest.entry),
		assetsDir,
		mainTex: template.mainTex,
		previewData,
		readOnly: false
	};
}

export function validateTemplate(manifest: TemplateManifest, options?: { dirName?: string }): TemplateValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!manifest || typeof manifest !== 'object') {
		return { ok: false, errors: ['Manifesto ausente.'], warnings };
	}
	if (!manifest.id || typeof manifest.id !== 'string') {
		errors.push('Campo "id" invalido.');
	} else if (/[\\/]/.test(manifest.id)) {
		errors.push('Campo "id" nao pode conter barras.');
	}
	if (!manifest.name || typeof manifest.name !== 'string') {
		errors.push('Campo "name" invalido.');
	}
	if (!manifest.version || typeof manifest.version !== 'string') {
		errors.push('Campo "version" invalido.');
	}
	if (!manifest.description || typeof manifest.description !== 'string') {
		errors.push('Campo "description" invalido.');
	}
	if (manifest.entry !== 'main.tex') {
		errors.push('Campo "entry" deve ser "main.tex".');
	}
	if (!Array.isArray(manifest.schema)) {
		errors.push('Campo "schema" deve ser uma lista.');
	} else {
		const seen = new Set<string>();
		for (const field of manifest.schema) {
			if (!field || typeof field !== 'object') {
				errors.push('Schema contem entrada invalida.');
				continue;
			}
			if (!field.key || typeof field.key !== 'string') {
				errors.push('Schema: "key" invalida.');
			} else if (seen.has(field.key)) {
				errors.push(`Schema duplicado para key "${field.key}".`);
			} else {
				seen.add(field.key);
				if (!/^[A-Za-z@]+$/.test(field.key)) {
					errors.push(`Schema: "key" invalida para "${field.key}". Use apenas letras A-Z ou @; macros TeX terminam em caracteres nao alfabeticos.`);
				}
			}
			if (!field.label || typeof field.label !== 'string') {
				errors.push(`Schema: "label" invalida para key "${field.key}".`);
			}
			if (!isValidFieldType(field.type)) {
				errors.push(`Schema: "type" invalido para key "${field.key}".`);
			}
		}
	}
	if (manifest.defaults && (typeof manifest.defaults !== 'object' || Array.isArray(manifest.defaults))) {
		warnings.push('Campo "defaults" deve ser um objeto.');
	}
	if (options?.dirName && typeof manifest.id === 'string' && manifest.id !== options.dirName) {
		errors.push('Campo "id" nao coincide com o nome da pasta.');
	}
	return { ok: errors.length === 0, errors, warnings };
}

export function renderTemplate(source: string, data: Record<string, any>, schema?: TemplateFieldSchema[]): string {
	return renderTemplateNormalized(source, normalizeTemplateData(data, schema));
}

function renderTemplateNormalized(source: string, normalized: Record<string, string>): string {
	let output = source;
	for (const [key, value] of Object.entries(normalized)) {
		const placeholder = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
		output = output.replace(placeholder, value);
	}
	return output;
}

function shouldRenderPlaceholders(source: string): boolean {
	return /\{\{\s*[A-Za-z@]+[\s\S]*?\}\}/.test(source);
}

function createTectonicArgs(bundlePath: string | undefined, outDir: string, texPath: string, options?: { fast?: boolean }): string[] {
	const args: string[] = [];
	if (bundlePath) {
		args.push('--bundle', bundlePath);
	}
	if (options?.fast) {
		args.push('--reruns', '0', '--chatter', 'minimal');
	}
	args.push('--outdir', outDir, texPath);
	return args;
}

async function createTemplateBuildDiagnostics(input: {
	command: string;
	args: string[];
	cwd: string;
	texPath: string;
	dataTexPath?: string;
	outDir: string;
	bundlePath?: string;
	assetsDir?: string;
	storageBaseDir: string;
}): Promise<TemplateBuildDiagnostics> {
	const commandPath = await resolveCommandPath(input.command);
	return {
		command: input.command,
		commandPath,
		args: [...input.args],
		cwd: input.cwd,
		texPath: input.texPath,
		texPathReal: await realpathSafe(input.texPath),
		dataTexPath: input.dataTexPath,
		dataTexPathReal: await realpathSafe(input.dataTexPath),
		outDir: input.outDir,
		outDirReal: await realpathSafe(input.outDir),
		bundlePath: input.bundlePath,
		bundlePathReal: await realpathSafe(input.bundlePath),
		assetsDir: input.assetsDir,
		assetsDirReal: await realpathSafe(input.assetsDir),
		platform: process.platform,
		isSnapTectonic: isSnapCommand(commandPath ?? input.command),
		storageBaseDir: input.storageBaseDir,
		storageBaseDirReal: await realpathSafe(input.storageBaseDir)
	};
}

async function refreshDiagnosticsPaths(diagnostics: TemplateBuildDiagnostics): Promise<void> {
	diagnostics.texPathReal = await realpathSafe(diagnostics.texPath);
	diagnostics.dataTexPathReal = await realpathSafe(diagnostics.dataTexPath);
	diagnostics.outDirReal = await realpathSafe(diagnostics.outDir);
	diagnostics.bundlePathReal = await realpathSafe(diagnostics.bundlePath);
	diagnostics.assetsDirReal = await realpathSafe(diagnostics.assetsDir);
	diagnostics.storageBaseDirReal = await realpathSafe(diagnostics.storageBaseDir);
	diagnostics.commandPath = diagnostics.commandPath ?? await resolveCommandPath(diagnostics.command);
	diagnostics.isSnapTectonic = isSnapCommand(diagnostics.commandPath ?? diagnostics.command);
}

async function runBuildPreflight(diagnostics: TemplateBuildDiagnostics): Promise<InternalBuildResult | undefined> {
	await refreshDiagnosticsPaths(diagnostics);
	if (isSnapPathRestriction(diagnostics, diagnostics.texPathReal ?? diagnostics.texPath)) {
		return {
			ok: false,
			stdout: '',
			stderr: `Snap restriction detected for input file: ${diagnostics.texPathReal ?? diagnostics.texPath}`,
			friendly: formatFriendlyBuildError('input_unreadable', diagnostics),
			notFound: false,
			failureCode: 'input_unreadable',
			diagnostics
		};
	}
	if (isSnapPathRestriction(diagnostics, diagnostics.outDirReal ?? diagnostics.outDir)) {
		return {
			ok: false,
			stdout: '',
			stderr: `Snap restriction detected for output directory: ${diagnostics.outDirReal ?? diagnostics.outDir}`,
			friendly: formatFriendlyBuildError('outdir_unwritable', diagnostics),
			notFound: false,
			failureCode: 'outdir_unwritable',
			diagnostics
		};
	}
	const texReadable = await checkAccess(diagnostics.texPath, fsConstants.R_OK);
	if (!texReadable.ok) {
		return {
			ok: false,
			stdout: '',
			stderr: renderAccessError('main.tex', texReadable.error),
			friendly: formatFriendlyBuildError('input_unreadable', diagnostics),
			notFound: false,
			failureCode: 'input_unreadable',
			diagnostics
		};
	}
	if (diagnostics.dataTexPath) {
		const dataReadable = await checkAccess(diagnostics.dataTexPath, fsConstants.R_OK);
		if (!dataReadable.ok) {
			return {
				ok: false,
				stdout: '',
				stderr: renderAccessError('co_data.tex', dataReadable.error),
				friendly: formatFriendlyBuildError('input_unreadable', diagnostics),
				notFound: false,
				failureCode: 'input_unreadable',
				diagnostics
			};
		}
	}
	const outReadable = await checkAccess(diagnostics.outDir, fsConstants.R_OK | fsConstants.X_OK);
	if (!outReadable.ok) {
		return {
			ok: false,
			stdout: '',
			stderr: renderAccessError('output directory', outReadable.error),
			friendly: formatFriendlyBuildError('outdir_unreadable', diagnostics),
			notFound: false,
			failureCode: 'outdir_unreadable',
			diagnostics
		};
	}
	const outWritable = await checkAccess(diagnostics.outDir, fsConstants.W_OK | fsConstants.X_OK);
	if (!outWritable.ok) {
		return {
			ok: false,
			stdout: '',
			stderr: renderAccessError('output directory', outWritable.error),
			friendly: formatFriendlyBuildError('outdir_unwritable', diagnostics),
			notFound: false,
			failureCode: 'outdir_unwritable',
			diagnostics
		};
	}
	if (diagnostics.bundlePath) {
		const bundleReadable = await checkAccess(diagnostics.bundlePath, fsConstants.R_OK);
		if (!bundleReadable.ok) {
			return {
				ok: false,
				stdout: '',
				stderr: renderAccessError('bundle', bundleReadable.error),
				friendly: formatFriendlyBuildError('bundle_unreadable', diagnostics),
				notFound: false,
				failureCode: 'bundle_unreadable',
				diagnostics
			};
		}
	}
	return undefined;
}

export async function buildPreview(
	template: TemplatePackage,
	previewData: Record<string, any>,
	outDir: string,
	options?: BuildPreviewOptions
): Promise<TemplateBuildResult> {
	const texPath = path.join(outDir, PREVIEW_TEX_NAME);
	const dataTexPath = path.join(outDir, DATA_TEX_NAME);
	const pdfPath = path.join(outDir, 'preview.pdf');
	const rawPdfPath = path.join(outDir, `${path.parse(texPath).name}.pdf`);
	const preferredLogPath = path.join(outDir, 'build.log');
	const buildCachePath = path.join(outDir, '.preview-cache.json');
	const bundlePath = normalizeOptionalPath(process.env.CO_TECTONIC_BUNDLE);
	const command = process.env.TECTONIC_PATH || 'tectonic';
	const args = createTectonicArgs(bundlePath, outDir, texPath, options);
	const diagnostics = await createTemplateBuildDiagnostics({
		command,
		args,
		cwd: outDir,
		texPath,
		dataTexPath,
		outDir,
		bundlePath,
		assetsDir: template.assetsDir,
		storageBaseDir: path.dirname(outDir)
	});
	try {
		await fs.mkdir(outDir, { recursive: true });
		await refreshDiagnosticsPaths(diagnostics);
		const data = mergeTemplateData(template.manifest.defaults, previewData);
		const normalized = normalizeTemplateData(data, template.manifest.schema);
		const tex = shouldRenderPlaceholders(template.mainTex)
			? renderTemplateNormalized(template.mainTex, normalized)
			: template.mainTex;
		const dataTex = buildCoDataTex(normalized);
		const previousTex = await readTextFile(texPath);
		if (previousTex !== tex) {
			await fs.writeFile(texPath, tex, 'utf8');
		}
		const previousDataTex = await readTextFile(dataTexPath);
		if (previousDataTex !== dataTex) {
			await fs.writeFile(dataTexPath, dataTex, 'utf8');
		}
		await refreshDiagnosticsPaths(diagnostics);
		const assetsOutDir = path.join(outDir, 'assets');
		const assetsCachePath = path.join(outDir, '.assets-cache');
		let assetsSync: { changed: boolean; signature: string };
		try {
			assetsSync = await syncAssetsIfChanged(template.assetsDir, assetsOutDir, assetsCachePath);
		} catch (err: any) {
			const failure = finalizeBuildResult({
				ok: false,
				stdout: '',
				stderr: String(err?.stack ?? err?.message ?? err),
				friendly: formatFriendlyBuildError('asset_sync_error', diagnostics),
				notFound: false,
				failureCode: 'asset_sync_error',
				diagnostics
			});
			const logPath = await writeBuildLog(preferredLogPath, failure);
			return { ...failure, pdfPath, logPath, texPath };
		}
		const texHash = hashText(`${tex}\n${dataTex}`);
		const buildCache = await readBuildCache(buildCachePath);
		const cacheHit = Boolean(buildCache
			&& buildCache.texHash === texHash
			&& buildCache.assetsSignature === assetsSync.signature
			&& await fileExists(pdfPath));
		if (cacheHit) {
			const cacheResult = finalizeBuildResult({
				ok: true,
				stdout: 'Cache hit.',
				stderr: '',
				friendly: '',
				notFound: false,
				diagnostics
			});
			const logPath = await writeBuildLog(preferredLogPath, cacheResult);
			return {
				...cacheResult,
				pdfPath,
				logPath,
				texPath
			};
		}
		const preflightFailure = await runBuildPreflight(diagnostics);
		if (preflightFailure) {
			const result = finalizeBuildResult(preflightFailure);
			const logPath = await writeBuildLog(preferredLogPath, result);
			return {
				...result,
				pdfPath,
				logPath,
				texPath
			};
		}
		const result = finalizeBuildResult(await runTectonic(diagnostics, options?.onProcess, options));
		if (result.ok) {
			await ensurePreviewPdf(rawPdfPath, pdfPath);
			if (!await fileExists(pdfPath)) {
				const missingPdf = finalizeBuildResult({
					ok: false,
					stdout: result.stdout,
					stderr: result.stderr,
					friendly: formatFriendlyBuildError('pdf_missing_after_success', diagnostics),
					notFound: false,
					failureCode: 'pdf_missing_after_success',
					diagnostics
				});
				const logPath = await writeBuildLog(preferredLogPath, missingPdf);
				return {
					...missingPdf,
					pdfPath,
					logPath,
					texPath
				};
			}
			await writeBuildCache(buildCachePath, {
				texHash,
				assetsSignature: assetsSync.signature
			});
		}
		const logPath = await writeBuildLog(preferredLogPath, result);
		return {
			...result,
			pdfPath,
			logPath,
			texPath
		};
	} catch (err: any) {
		const failureCode = classifyFsFailure(err, diagnostics) ?? 'unknown_build_error';
		const failure = finalizeBuildResult({
			ok: false,
			stdout: '',
			stderr: String(err?.stack ?? err?.message ?? err),
			friendly: formatFriendlyBuildError(failureCode, diagnostics),
			notFound: false,
			failureCode,
			diagnostics
		});
		const logPath = await writeBuildLog(preferredLogPath, failure);
		return {
			...failure,
			pdfPath,
			logPath,
			texPath
		};
	}
}

export class TemplateBuildService {
	private timer?: NodeJS.Timeout;
	private pending?: TemplateBuildRequest;
	private currentProcess?: ChildProcess;
	private buildId = 0;
	private readonly debounceMs: number;

	constructor(
		private readonly options: {
			debounceMs?: number;
			onStatus?: (status: TemplateBuildStatus) => void;
			onComplete?: (result: TemplateBuildResult) => void;
		}
	) {
		this.debounceMs = options.debounceMs ?? 900;
	}

	schedule(request: TemplateBuildRequest) {
		this.pending = request;
		this.cancelRunning();
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			void this.runBuild();
		}, this.debounceMs);
	}

	dispose() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.cancelRunning();
	}

	private async runBuild() {
		const request = this.pending;
		if (!request) {
			return;
		}
		this.pending = undefined;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		const buildId = ++this.buildId;
		this.cancelRunning();
		this.options.onStatus?.({ state: 'building', message: 'Gerando PDF...' });
		try {
			const result = await buildPreview(request.template, request.previewData, request.outDir, {
				onProcess: (child) => {
					this.currentProcess = child;
				},
				fast: request.fast
			});
			if (buildId !== this.buildId) {
				return;
			}
			this.currentProcess = undefined;
			if (result.ok) {
				this.options.onStatus?.({ state: 'success', message: 'PDF atualizado.' });
			} else {
				this.options.onStatus?.({ state: 'error', message: describeTemplateBuildFailure(result).summary });
			}
			this.options.onComplete?.(result);
		} catch (err: any) {
			if (buildId !== this.buildId) {
				return;
			}
			this.currentProcess = undefined;
			const diagnostics = await createTemplateBuildDiagnostics({
				command: process.env.TECTONIC_PATH || 'tectonic',
				args: createTectonicArgs(normalizeOptionalPath(process.env.CO_TECTONIC_BUNDLE), request.outDir, path.join(request.outDir, PREVIEW_TEX_NAME), { fast: request.fast }),
				cwd: request.outDir,
				texPath: path.join(request.outDir, PREVIEW_TEX_NAME),
				dataTexPath: path.join(request.outDir, DATA_TEX_NAME),
				outDir: request.outDir,
				bundlePath: normalizeOptionalPath(process.env.CO_TECTONIC_BUNDLE),
				assetsDir: request.template.assetsDir,
				storageBaseDir: path.dirname(request.outDir)
			});
			const failure = finalizeBuildResult({
				ok: false,
				stdout: '',
				stderr: String(err?.message ?? err),
				friendly: formatFriendlyBuildError('unknown_build_error', diagnostics),
				notFound: false,
				failureCode: 'unknown_build_error',
				diagnostics
			});
			const logPath = await writeBuildLog(path.join(request.outDir, 'build.log'), failure);
			this.options.onStatus?.({ state: 'error', message: describeTemplateBuildFailure(failure).summary });
			this.options.onComplete?.({
				...failure,
				pdfPath: path.join(request.outDir, 'preview.pdf'),
				logPath,
				texPath: path.join(request.outDir, PREVIEW_TEX_NAME)
			});
		}
	}

	private cancelRunning() {
		if (this.currentProcess && !this.currentProcess.killed) {
			try {
				this.currentProcess.kill();
			} catch {
				// best effort
			}
			this.currentProcess = undefined;
		}
	}
}

function isValidFieldType(value: any): value is TemplateFieldType {
	return value === 'string' || value === 'string[]' || value === 'number' || value === 'boolean' || value === 'latex';
}

async function scanTemplatesFromDir(dir: string, readOnly: boolean): Promise<TemplateScanResult> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const summaries: TemplateSummary[] = [];
		const issues: TemplateLoadIssue[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const templateDir = path.join(dir, entry.name);
			const manifestPath = path.join(templateDir, 'template.json');
			if (!await fileExists(manifestPath)) {
				if (await looksLikeTemplateDir(templateDir)) {
					issues.push({
						id: entry.name,
						dir: templateDir,
						readOnly,
						code: 'manifest_missing',
						path: manifestPath,
						message: 'template.json ausente.'
					});
				}
				continue;
			}
			const manifestResult = await readJsonFileDetailed<TemplateManifest>(manifestPath);
			if (manifestResult.kind !== 'ok' || !manifestResult.value) {
				issues.push({
					id: entry.name,
					dir: templateDir,
					readOnly,
					code: 'manifest_unreadable',
					path: manifestPath,
					message: 'Nao foi possivel ler template.json.'
				});
				continue;
			}
			const manifest = manifestResult.value;
			const validation = validateTemplate(manifest, { dirName: entry.name });
			if (!validation.ok) {
				issues.push({
					id: manifest.id || entry.name,
					dir: templateDir,
					readOnly,
					code: 'manifest_invalid',
					path: manifestPath,
					message: validation.errors.join(' | ')
				});
				continue;
			}
			const entryPath = path.join(templateDir, manifest.entry);
			if (!await fileExists(entryPath)) {
				issues.push({
					id: manifest.id,
					dir: templateDir,
					readOnly,
					code: 'entry_missing',
					path: entryPath,
					message: `Arquivo de entrada ausente: ${manifest.entry}.`
				});
				continue;
			}
			const previewPath = path.join(templateDir, 'preview_data.json');
			const previewResult = await readJsonFileDetailed<Record<string, any>>(previewPath);
			if (previewResult.kind === 'error') {
				issues.push({
					id: manifest.id,
					dir: templateDir,
					readOnly,
					code: 'preview_data_unreadable',
					path: previewPath,
					message: 'preview_data.json existe mas nao pode ser lido.'
				});
			}
			summaries.push({
				id: manifest.id,
				name: manifest.name,
				version: manifest.version,
				description: manifest.description,
				path: templateDir,
				readOnly
			});
		}
		return { templates: summaries, issues };
	} catch {
		return { templates: [], issues: [] };
	}
}

async function loadTemplateFromDir(dir: string, id: string, readOnly: boolean): Promise<TemplatePackage | undefined> {
	const templateDir = path.join(dir, id);
	const manifestPath = path.join(templateDir, 'template.json');
	if (!await fileExists(manifestPath)) {
		return undefined;
	}
	const manifest = await readJsonFile<TemplateManifest>(manifestPath);
	if (!manifest) {
		return undefined;
	}
	const validation = validateTemplate(manifest, { dirName: id });
	if (!validation.ok) {
		return undefined;
	}
	const entryPath = path.join(templateDir, manifest.entry);
	let mainTex = '';
	try {
		mainTex = await fs.readFile(entryPath, 'utf8');
	} catch {
		mainTex = '';
	}
	const previewPath = path.join(templateDir, 'preview_data.json');
	const previewData = await readJsonFile<Record<string, any>>(previewPath) ?? {};
	return {
		manifest,
		dir: templateDir,
		entryPath,
		assetsDir: path.join(templateDir, 'assets'),
		mainTex,
		previewData,
		readOnly
	};
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
	const result = await readJsonFileDetailed<T>(filePath);
	return result.kind === 'ok' ? result.value : undefined;
}

async function readJsonFileDetailed<T>(filePath: string): Promise<
	| { kind: 'ok'; value: T }
	| { kind: 'missing' }
	| { kind: 'error' }
> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return { kind: 'ok', value: JSON.parse(raw) as T };
	} catch {
		if (!await fileExists(filePath)) {
			return { kind: 'missing' };
		}
		return { kind: 'error' };
	}
}

async function looksLikeTemplateDir(dir: string): Promise<boolean> {
	const candidates = ['main.tex', 'preview_data.json', 'assets'];
	for (const candidate of candidates) {
		if (await fileExists(path.join(dir, candidate))) {
			return true;
		}
	}
	return false;
}

async function fileExists(filePath: string) {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readTextFile(filePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(filePath, 'utf8');
	} catch {
		return undefined;
	}
}

async function readBuildCache(filePath: string): Promise<{ texHash: string; assetsSignature: string } | undefined> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		const parsed = JSON.parse(raw) as { texHash?: string; assetsSignature?: string };
		if (!parsed || typeof parsed.texHash !== 'string' || typeof parsed.assetsSignature !== 'string') {
			return undefined;
		}
		return { texHash: parsed.texHash, assetsSignature: parsed.assetsSignature };
	} catch {
		return undefined;
	}
}

async function writeBuildCache(filePath: string, cache: { texHash: string; assetsSignature: string }) {
	const content = JSON.stringify(cache);
	await fs.writeFile(filePath, content, 'utf8');
}

async function ensurePreviewPdf(sourcePath: string, targetPath: string): Promise<void> {
	if (!await fileExists(sourcePath)) {
		return;
	}
	if (sourcePath === targetPath) {
		return;
	}
	try {
		await fs.rename(sourcePath, targetPath);
	} catch {
		await fs.copyFile(sourcePath, targetPath);
	}
}

function mergeTemplateData(defaults: Record<string, any> | undefined, previewData: Record<string, any>): Record<string, any> {
	const base = defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? defaults : {};
	return { ...base, ...previewData };
}

function normalizeTemplateData(data: Record<string, any>, schema?: TemplateFieldSchema[]) {
	const rawKeys = schema ? new Set(schema.filter(field => field.type === 'latex').map(field => field.key)) : undefined;
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(data ?? {})) {
		const isRaw = rawKeys?.has(key) ?? false;
		normalized[key] = formatTemplateValue(value, isRaw);
	}
	return normalized;
}

function buildCoDataTex(normalized: Record<string, string>): string {
	const entries = Object.entries(normalized)
		.map(([key, value]) => [key.trim(), value] as const)
		.filter(([key]) => key.length > 0)
		.sort(([a], [b]) => a.localeCompare(b));
	const lines = ['% Generated by co-template-core.'];
	for (const [key, value] of entries) {
		lines.push(`\\def\\${key}{${value}}`);
	}
	return `${lines.join('\n')}\n`;
}

function formatTemplateValue(value: any, raw: boolean): string {
	if (Array.isArray(value)) {
		const joined = value.map(entry => entry === null || entry === undefined ? '' : String(entry)).join('\n');
		return raw ? joined : escapeLatexBlock(joined);
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? String(value) : '';
	}
	if (typeof value === 'boolean') {
		return String(value);
	}
	if (value === null || value === undefined) {
		return '';
	}
	const text = String(value);
	return raw ? text : escapeLatexBlock(text);
}

function escapeLatex(value: string): string {
	const map: Record<string, string> = {
		'\\': '\\textbackslash{}',
		'{': '\\{',
		'}': '\\}',
		'%': '\\%',
		'$': '\\$',
		'#': '\\#',
		'&': '\\&',
		'_': '\\_',
		'^': '\\textasciicircum{}',
		'~': '\\textasciitilde{}'
	};
	return value.replace(/[\\{}%$#&_~^]/g, match => map[match]);
}

function escapeLatexBlock(value: string): string {
	const escaped = escapeLatex(value);
	return escaped.replace(/\r?\n/g, '\\\\');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashText(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}

async function syncAssets(sourceDir: string, targetDir: string) {
	if (!await fileExists(sourceDir)) {
		await fs.rm(targetDir, { recursive: true, force: true });
		return;
	}
	await fs.rm(targetDir, { recursive: true, force: true });
	await copyDirectory(sourceDir, targetDir);
}

async function syncAssetsIfChanged(sourceDir: string, targetDir: string, cachePath: string): Promise<{ changed: boolean; signature: string }> {
	const signature = await getAssetsSignature(sourceDir);
	const previous = await readTextFile(cachePath) ?? '';
	let changed = signature !== previous;
	if (!changed && signature === '') {
		const targetExists = await fileExists(targetDir);
		if (targetExists) {
			changed = true;
		}
	}
	if (changed) {
		await syncAssets(sourceDir, targetDir);
		await fs.writeFile(cachePath, signature, 'utf8');
	}
	return { changed, signature };
}

async function getAssetsSignature(dir: string): Promise<string> {
	if (!await fileExists(dir)) {
		return '';
	}
	const entries: string[] = [];
	await collectAssetEntries(dir, dir, entries);
	entries.sort();
	return entries.join('\n');
}

async function collectAssetEntries(rootDir: string, currentDir: string, entries: string[]) {
	const dirents = await fs.readdir(currentDir, { withFileTypes: true });
	for (const entry of dirents) {
		const sourcePath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			await collectAssetEntries(rootDir, sourcePath, entries);
		} else if (entry.isFile()) {
			const stat = await fs.stat(sourcePath);
			const rel = path.relative(rootDir, sourcePath).split(path.sep).join('/');
			const signature = `${rel}|${stat.size}|${Math.round(stat.mtimeMs)}`;
			entries.push(signature);
		}
	}
}

async function copyDirectory(sourceDir: string, targetDir: string) {
	await fs.mkdir(targetDir, { recursive: true });
	const entries = await fs.readdir(sourceDir, { withFileTypes: true });
	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.join(targetDir, entry.name);
		if (entry.isDirectory()) {
			await copyDirectory(sourcePath, targetPath);
		} else if (entry.isFile()) {
			await fs.copyFile(sourcePath, targetPath);
		}
	}
}

async function writeBuildLog(logPath: string, result: InternalBuildResult): Promise<string> {
	const content = renderBuildLog(result);
	try {
		await fs.mkdir(path.dirname(logPath), { recursive: true });
		await fs.writeFile(logPath, content, 'utf8');
		return logPath;
	} catch {
		const fallbackDir = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-log-'));
		const fallbackPath = path.join(fallbackDir, 'build.log');
		await fs.writeFile(fallbackPath, content, 'utf8');
		return fallbackPath;
	}
}

function renderBuildLog(result: InternalBuildResult): string {
	const diagnostics = result.diagnostics;
	const stamp = new Date().toISOString();
	const sections: string[] = [`[${stamp}] ${result.ok ? 'OK' : 'ERRO'}`];
	if (result.failureCode) {
		sections.push(`failureCode: ${result.failureCode}`);
	}
	if (result.friendly) {
		sections.push(`friendly: ${result.friendly}`);
	}
	if (diagnostics) {
		const details = [
			['command', diagnostics.command],
			['commandPath', diagnostics.commandPath],
			['args', diagnostics.args.join(' ')],
			['cwd', diagnostics.cwd],
			['texPath', diagnostics.texPath],
			['texPathReal', diagnostics.texPathReal],
			['dataTexPath', diagnostics.dataTexPath],
			['dataTexPathReal', diagnostics.dataTexPathReal],
			['outDir', diagnostics.outDir],
			['outDirReal', diagnostics.outDirReal],
			['bundlePath', diagnostics.bundlePath],
			['bundlePathReal', diagnostics.bundlePathReal],
			['assetsDir', diagnostics.assetsDir],
			['assetsDirReal', diagnostics.assetsDirReal],
			['storageBaseDir', diagnostics.storageBaseDir],
			['storageBaseDirReal', diagnostics.storageBaseDirReal],
			['platform', diagnostics.platform],
			['isSnapTectonic', String(diagnostics.isSnapTectonic)]
		].filter(([, value]) => Boolean(value));
		if (details.length) {
			sections.push('diagnostics:');
			for (const [label, value] of details) {
				sections.push(`  ${label}: ${value}`);
			}
		}
	}
	if (result.stdout) {
		sections.push('', 'stdout:', result.stdout);
	}
	if (result.stderr) {
		sections.push('', 'stderr:', result.stderr);
	}
	return sections.join('\n') || 'Sem log.';
}

function finalizeBuildResult(result: InternalBuildResult): InternalBuildResult {
	const diagnostics = result.diagnostics;
	if (diagnostics) {
		diagnostics.stdoutTail = tailText(result.stdout);
		diagnostics.stderrTail = tailText(result.stderr);
	}
	return result;
}

function tailText(value: string | undefined, maxChars = 4000): string | undefined {
	if (!value) {
		return undefined;
	}
	if (value.length <= maxChars) {
		return value;
	}
	return value.slice(value.length - maxChars);
}

type AccessCheckResult = {
	ok: boolean;
	error?: NodeJS.ErrnoException;
};

async function checkAccess(targetPath: string | undefined, mode: number): Promise<AccessCheckResult> {
	if (!targetPath) {
		return { ok: false, error: Object.assign(new Error('Path ausente.'), { code: 'ENOENT' }) as NodeJS.ErrnoException };
	}
	try {
		await fs.access(targetPath, mode);
		return { ok: true };
	} catch (err: any) {
		return { ok: false, error: err };
	}
}

function renderAccessError(label: string, error: NodeJS.ErrnoException | undefined): string {
	if (!error) {
		return `${label}: acesso negado.`;
	}
	return `${label}: ${error.message}`;
}

async function resolveCommandPath(command: string): Promise<string | undefined> {
	const normalized = normalizeOptionalPath(command);
	if (!normalized) {
		return undefined;
	}
	if (path.isAbsolute(normalized) || normalized.includes(path.sep)) {
		return await fileExists(normalized) ? normalized : undefined;
	}
	const pathEnv = process.env.PATH ?? '';
	const entries = pathEnv.split(path.delimiter).filter(Boolean);
	const extensions = process.platform === 'win32'
		? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
		: [''];
	for (const entry of entries) {
		for (const extension of extensions) {
			const candidate = path.join(entry, extension ? `${normalized}${extension}` : normalized);
			if (await fileExists(candidate)) {
				return candidate;
			}
		}
	}
	return undefined;
}

function isSnapCommand(command: string | undefined): boolean {
	return Boolean(command && /(?:^|\/)snap(?:\/|$)/.test(command));
}

function isSnapPathRestriction(diagnostics: TemplateBuildDiagnostics, targetPath: string | undefined): boolean {
	if (!diagnostics.isSnapTectonic || diagnostics.platform !== 'linux' || !targetPath) {
		return false;
	}
	const homeDir = os.homedir();
	return !isPathWithin(targetPath, homeDir);
}

function isPathWithin(targetPath: string, rootPath: string): boolean {
	const normalizedRoot = path.resolve(rootPath);
	const normalizedTarget = path.resolve(targetPath);
	if (normalizedTarget === normalizedRoot) {
		return true;
	}
	const relative = path.relative(normalizedRoot, normalizedTarget);
	return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function realpathSafe(targetPath: string | undefined): Promise<string | undefined> {
	if (!targetPath) {
		return undefined;
	}
	try {
		return await fs.realpath(targetPath);
	} catch {
		return undefined;
	}
}

function classifyFsFailure(error: any, diagnostics?: TemplateBuildDiagnostics): BuildFailureCode | undefined {
	const code = String(error?.code ?? '');
	const errorPath = typeof error?.path === 'string' ? error.path : '';
	if (code === 'ENOENT' && diagnostics?.bundlePath && errorPath === diagnostics.bundlePath) {
		return 'bundle_unreadable';
	}
	if (code === 'ENOENT' && diagnostics?.texPath && errorPath === diagnostics.texPath) {
		return 'input_unreadable';
	}
	if ((code === 'EACCES' || code === 'EPERM') && diagnostics?.outDir && errorPath.startsWith(diagnostics.outDir)) {
		return 'outdir_unwritable';
	}
	if ((code === 'EACCES' || code === 'EPERM') && diagnostics?.bundlePath && errorPath === diagnostics.bundlePath) {
		return 'bundle_unreadable';
	}
	return undefined;
}

function classifyTectonicFailure(stderr: string, diagnostics: TemplateBuildDiagnostics): BuildFailureCode {
	const message = stderr.toLowerCase();
	if (message.includes('failed to open input file "main.tex"') || message.includes('open of primary input failed')) {
		return 'input_unreadable';
	}
	if (message.includes('output directory') && message.includes('does not exist')) {
		return 'outdir_unwritable';
	}
	if (message.includes('permission denied') && diagnostics.isSnapTectonic) {
		if (isSnapPathRestriction(diagnostics, diagnostics.texPathReal ?? diagnostics.texPath)) {
			return 'input_unreadable';
		}
		if (isSnapPathRestriction(diagnostics, diagnostics.outDirReal ?? diagnostics.outDir)) {
			return 'outdir_unwritable';
		}
	}
	if (message.includes('bundle') && (message.includes('permission denied') || message.includes('no such file'))) {
		return 'bundle_unreadable';
	}
	return 'latex_compile_error';
}

export function describeTemplateBuildFailure(result: Pick<TemplateBuildResult, 'friendly' | 'failureCode' | 'diagnostics'>): TemplateBuildFailureDescription {
	const diagnostics = result.diagnostics;
	const fallbackSummary = result.friendly || 'Nao foi possivel gerar o PDF.';
	const technicalDetails: Array<{ label: string; value: string }> = [];
	if (result.failureCode) {
		technicalDetails.push({ label: 'failureCode', value: result.failureCode });
	}
	if (diagnostics?.command) {
		technicalDetails.push({ label: 'comando', value: diagnostics.command });
	}
	if (diagnostics?.commandPath) {
		technicalDetails.push({ label: 'executavel', value: diagnostics.commandPath });
	}
	if (diagnostics?.texPathReal ?? diagnostics?.texPath) {
		technicalDetails.push({ label: 'main.tex', value: diagnostics?.texPathReal ?? diagnostics?.texPath ?? '' });
	}
	if (diagnostics?.outDirReal ?? diagnostics?.outDir) {
		technicalDetails.push({ label: 'saida', value: diagnostics?.outDirReal ?? diagnostics?.outDir ?? '' });
	}
	if (diagnostics?.bundlePathReal ?? diagnostics?.bundlePath) {
		technicalDetails.push({ label: 'bundle', value: diagnostics?.bundlePathReal ?? diagnostics?.bundlePath ?? '' });
	}
	if (diagnostics?.stderrTail) {
		technicalDetails.push({ label: 'stderr', value: diagnostics.stderrTail });
	}
	switch (result.failureCode) {
		case 'tectonic_not_found':
			return {
				summary: 'Nao encontrei o Tectonic no ambiente atual.',
				detail: 'Instale o Tectonic ou ajuste TECTONIC_PATH para um executavel valido.',
				technicalDetails
			};
		case 'tectonic_spawn_error':
			return {
				summary: 'Falha ao iniciar o processo do Tectonic.',
				detail: 'O executavel foi localizado, mas o sistema nao conseguiu inicia-lo.',
				technicalDetails
			};
		case 'input_unreadable':
			return {
				summary: 'O Tectonic nao conseguiu ler o arquivo principal do documento.',
				detail: buildInputUnreadableDetail(diagnostics),
				technicalDetails
			};
		case 'outdir_unreadable':
			return {
				summary: 'O diretorio de saida do PDF nao pode ser lido.',
				detail: buildOutDirDetail(diagnostics, 'leitura'),
				technicalDetails
			};
		case 'outdir_unwritable':
			return {
				summary: 'O diretorio de saida do PDF nao pode ser gravado.',
				detail: buildOutDirDetail(diagnostics, 'gravacao'),
				technicalDetails
			};
		case 'bundle_unreadable':
			return {
				summary: 'O bundle configurado do Tectonic nao pode ser lido.',
				detail: diagnostics?.bundlePathReal
					? `Verifique o caminho real do bundle: ${diagnostics.bundlePathReal}.`
					: diagnostics?.bundlePath
						? `Verifique o caminho do bundle: ${diagnostics.bundlePath}.`
						: 'Revise co.tectonic.bundlePath ou CO_TECTONIC_BUNDLE.',
				technicalDetails
			};
		case 'asset_sync_error':
			return {
				summary: 'Falha ao sincronizar os assets do template antes da compilacao.',
				detail: 'Verifique se os arquivos do template estao acessiveis e se o diretorio de saida aceita copia.',
				technicalDetails
			};
		case 'latex_compile_error':
			return {
				summary: 'O PDF nao foi gerado porque o LaTeX falhou durante a compilacao.',
				detail: 'Abra o log para ver o erro TeX detalhado e a linha que quebrou a compilacao.',
				technicalDetails
			};
		case 'pdf_missing_after_success':
			return {
				summary: 'O Tectonic terminou sem erro, mas o PDF esperado nao apareceu.',
				detail: 'Verifique o log e o diretorio de saida; isso normalmente indica problema de permissao, cache ou arquivo movido.',
				technicalDetails
			};
		case 'unknown_build_error':
		default:
			return {
				summary: fallbackSummary,
				detail: 'Abra o log completo para inspecionar o erro bruto e os caminhos reais usados no build.',
				technicalDetails
			};
	}
}

function buildInputUnreadableDetail(diagnostics?: TemplateBuildDiagnostics): string {
	const target = diagnostics?.texPathReal ?? diagnostics?.texPath;
	if (!target) {
		return 'Verifique permissao de leitura no main.tex gerado.';
	}
	if (isSnapPathRestriction(diagnostics ?? {
		command: '',
		args: [],
		cwd: '',
		texPath: '',
		outDir: '',
		platform: process.platform,
		isSnapTectonic: false,
		storageBaseDir: ''
	}, target)) {
		return `O caminho real de main.tex resolve para "${target}", fora do home visivel para o Tectonic via Snap. Revise symlink, mount externo ou CO_SAVE_DIR.`;
	}
	return `Verifique permissao de leitura no main.tex em "${target}". ACL, owner, symlink e mount podem causar esse erro.`;
}

function buildOutDirDetail(diagnostics: TemplateBuildDiagnostics | undefined, action: 'leitura' | 'gravacao'): string {
	const target = diagnostics?.outDirReal ?? diagnostics?.outDir;
	if (!target) {
		return `Verifique permissao de ${action} no diretorio de saida.`;
	}
	if (isSnapPathRestriction(diagnostics ?? {
		command: '',
		args: [],
		cwd: '',
		texPath: '',
		outDir: '',
		platform: process.platform,
		isSnapTectonic: false,
		storageBaseDir: ''
	}, target)) {
		return `O caminho real do diretorio de saida resolve para "${target}", fora do home visivel para o Tectonic via Snap. Revise symlink, mount externo ou CO_SAVE_DIR.`;
	}
	return `Verifique permissao de ${action} em "${target}".`;
}

function formatFriendlyBuildError(failureCode: BuildFailureCode, diagnostics?: TemplateBuildDiagnostics): string {
	switch (failureCode) {
		case 'tectonic_not_found':
			return 'Nao encontrei o Tectonic. Instale o Tectonic para gerar o PDF.';
		case 'tectonic_spawn_error':
			return 'Falha ao iniciar o Tectonic. Verifique o executavel configurado.';
		case 'input_unreadable':
			return diagnostics?.texPathReal ?? diagnostics?.texPath
				? `O Tectonic nao conseguiu ler o arquivo principal do documento: ${diagnostics?.texPathReal ?? diagnostics?.texPath}.`
				: 'O Tectonic nao conseguiu ler o arquivo principal do documento.';
		case 'outdir_unreadable':
			return diagnostics?.outDirReal ?? diagnostics?.outDir
				? `O diretorio de saida nao pode ser lido: ${diagnostics?.outDirReal ?? diagnostics?.outDir}.`
				: 'O diretorio de saida do PDF nao pode ser lido.';
		case 'outdir_unwritable':
			return diagnostics?.outDirReal ?? diagnostics?.outDir
				? `O diretorio de saida nao pode ser gravado: ${diagnostics?.outDirReal ?? diagnostics?.outDir}.`
				: 'O diretorio de saida do PDF nao pode ser gravado.';
		case 'bundle_unreadable':
			return diagnostics?.bundlePathReal ?? diagnostics?.bundlePath
				? `O bundle do Tectonic nao pode ser lido: ${diagnostics?.bundlePathReal ?? diagnostics?.bundlePath}.`
				: 'O bundle configurado do Tectonic nao pode ser lido.';
		case 'asset_sync_error':
			return 'Falha ao preparar os assets do template antes da compilacao.';
		case 'latex_compile_error':
			return 'O PDF nao foi gerado porque a compilacao LaTeX falhou.';
		case 'pdf_missing_after_success':
			return 'O build terminou sem erro, mas o PDF esperado nao foi encontrado.';
		case 'unknown_build_error':
		default:
			return 'Nao foi possivel gerar o PDF.';
	}
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
	if (!value || typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

async function pickExistingPath(value: string | undefined): Promise<string | undefined> {
	const normalized = normalizeOptionalPath(value);
	if (!normalized) {
		return undefined;
	}
	if (await fileExists(normalized)) {
		return normalized;
	}
	return undefined;
}

async function findBundleInCache(cacheRoot: string): Promise<string | undefined> {
	const candidates = [
		path.join(cacheRoot, 'Tectonic'),
		path.join(cacheRoot, 'tectonic')
	];
	for (const dir of candidates) {
		const found = await findBundleInDir(dir, 2);
		if (found) {
			return found;
		}
	}
	return undefined;
}

async function findBundleInDir(dir: string, depth: number): Promise<string | undefined> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const direct = entries.find(entry => entry.isFile() && entry.name.endsWith('.bundle'));
		if (direct) {
			return path.join(dir, direct.name);
		}
		if (depth <= 0) {
			return undefined;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const nested = await findBundleInDir(path.join(dir, entry.name), depth - 1);
			if (nested) {
				return nested;
			}
		}
		return undefined;
	} catch {
		return undefined;
	}
}

async function runTectonic(
	diagnostics: TemplateBuildDiagnostics,
	onProcess?: (child: ChildProcess) => void,
	options?: { fast?: boolean }
): Promise<InternalBuildResult> {
	return new Promise(resolve => {
		let stdout = '';
		let stderr = '';
		const args = diagnostics.args.length
			? diagnostics.args
			: createTectonicArgs(diagnostics.bundlePath, diagnostics.outDir, diagnostics.texPath, options);
		const command = diagnostics.commandPath ?? diagnostics.command;
		const child = spawn(command, args, { cwd: diagnostics.cwd, shell: process.platform === 'win32' });
		onProcess?.(child);
		child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
		child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
		child.on('error', (err: any) => {
			const notFound = err?.code === 'ENOENT';
			const failureCode: BuildFailureCode = notFound ? 'tectonic_not_found' : 'tectonic_spawn_error';
			resolve({
				ok: false,
				stdout,
				stderr: `${stderr}\n${err?.message ?? ''}`.trim(),
				friendly: formatFriendlyBuildError(failureCode, diagnostics),
				notFound,
				failureCode,
				diagnostics
			});
		});
		child.on('close', (code: number | null) => {
			if (code === 0) {
				resolve({ ok: true, stdout, stderr, friendly: '', notFound: false, diagnostics });
			} else {
				const failureCode = classifyTectonicFailure(stderr, diagnostics);
				resolve({
					ok: false,
					stdout,
					stderr,
					friendly: formatFriendlyBuildError(failureCode, diagnostics),
					notFound: false,
					failureCode,
					diagnostics
				});
			}
		});
	});
}
