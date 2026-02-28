/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
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

export type TemplateValidationResult = {
	ok: boolean;
	errors: string[];
	warnings: string[];
};

export type TemplateBuildStatus = {
	state: 'idle' | 'building' | 'success' | 'error';
	message?: string;
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
};

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
	const resolved = normalizeStorage(storage, fallbackDir);
	const summaries = new Map<string, TemplateSummary>();
	const primary = await readTemplatesFromDir(resolved.primaryDir, false);
	for (const summary of primary) {
		summaries.set(summary.id, summary);
	}
	if (resolved.fallbackDir) {
		const fallback = await readTemplatesFromDir(resolved.fallbackDir, true);
		for (const summary of fallback) {
			if (!summaries.has(summary.id)) {
				summaries.set(summary.id, summary);
			}
		}
	}
	return Array.from(summaries.values()).sort((a, b) => a.name.localeCompare(b.name));
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

export async function buildPreview(
	template: TemplatePackage,
	previewData: Record<string, any>,
	outDir: string,
	options?: BuildPreviewOptions
): Promise<TemplateBuildResult> {
	await fs.mkdir(outDir, { recursive: true });
	const data = mergeTemplateData(template.manifest.defaults, previewData);
	const normalized = normalizeTemplateData(data, template.manifest.schema);
	const tex = shouldRenderPlaceholders(template.mainTex)
		? renderTemplateNormalized(template.mainTex, normalized)
		: template.mainTex;
	const texPath = path.join(outDir, PREVIEW_TEX_NAME);
	const dataTexPath = path.join(outDir, DATA_TEX_NAME);
	const dataTex = buildCoDataTex(normalized);
	const previousTex = await readTextFile(texPath);
	const texChanged = previousTex !== tex;
	if (texChanged) {
		await fs.writeFile(texPath, tex, 'utf8');
	}
	const previousDataTex = await readTextFile(dataTexPath);
	if (previousDataTex !== dataTex) {
		await fs.writeFile(dataTexPath, dataTex, 'utf8');
	}
	const assetsOutDir = path.join(outDir, 'assets');
	const assetsCachePath = path.join(outDir, '.assets-cache');
	const assetsSync = await syncAssetsIfChanged(template.assetsDir, assetsOutDir, assetsCachePath);
	const pdfPath = path.join(outDir, 'preview.pdf');
	const rawPdfPath = path.join(outDir, `${path.parse(texPath).name}.pdf`);
	const logPath = path.join(outDir, 'build.log');
	const buildCachePath = path.join(outDir, '.preview-cache.json');
	const texHash = hashText(`${tex}\n${dataTex}`);
	const buildCache = await readBuildCache(buildCachePath);
	const cacheHit = Boolean(buildCache
		&& buildCache.texHash === texHash
		&& buildCache.assetsSignature === assetsSync.signature
		&& await fileExists(pdfPath));
	if (cacheHit) {
		await writeBuildLog(logPath, { ok: true, stdout: 'Cache hit.', stderr: '' });
		return {
			ok: true,
			stdout: '',
			stderr: '',
			friendly: '',
			notFound: false,
			pdfPath,
			logPath,
			texPath
		};
	}
	const result = await runTectonic(texPath, outDir, options?.onProcess, options);
	await writeBuildLog(logPath, result);
	if (result.ok) {
		await ensurePreviewPdf(rawPdfPath, pdfPath);
		await writeBuildCache(buildCachePath, {
			texHash,
			assetsSignature: assetsSync.signature
		});
	}
	return {
		...result,
		pdfPath,
		logPath,
		texPath
	};
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
				this.options.onStatus?.({ state: 'error', message: result.friendly });
			}
			this.options.onComplete?.(result);
		} catch (err: any) {
			if (buildId !== this.buildId) {
				return;
			}
			this.currentProcess = undefined;
			const friendly = 'Nao foi possivel gerar o PDF.';
			this.options.onStatus?.({ state: 'error', message: friendly });
			this.options.onComplete?.({
				ok: false,
				stdout: '',
				stderr: String(err?.message ?? err),
				friendly,
				notFound: false,
				pdfPath: path.join(request.outDir, 'preview.pdf'),
				logPath: path.join(request.outDir, 'build.log'),
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

async function readTemplatesFromDir(dir: string, readOnly: boolean): Promise<TemplateSummary[]> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const summaries: TemplateSummary[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const templateDir = path.join(dir, entry.name);
			const manifestPath = path.join(templateDir, 'template.json');
			if (!await fileExists(manifestPath)) {
				continue;
			}
			const manifest = await readJsonFile<TemplateManifest>(manifestPath);
			if (!manifest) {
				continue;
			}
			const validation = validateTemplate(manifest, { dirName: entry.name });
			if (!validation.ok) {
				continue;
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
		return summaries;
	} catch {
		return [];
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
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
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

async function writeBuildLog(logPath: string, result: { ok: boolean; stdout: string; stderr: string }) {
	const stamp = new Date().toISOString();
	const lines = [
		`[${stamp}] ${result.ok ? 'OK' : 'ERRO'}`,
		result.stdout,
		result.stderr
	].filter(Boolean).join('\n');
	await fs.writeFile(logPath, lines || 'Sem log.', 'utf8');
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
	texPath: string,
	outDir: string,
	onProcess?: (child: ChildProcess) => void,
	options?: { fast?: boolean }
): Promise<{ ok: boolean; stdout: string; stderr: string; friendly: string; notFound: boolean }> {
	return new Promise(resolve => {
		let stdout = '';
		let stderr = '';
		const cmd = process.env.TECTONIC_PATH || 'tectonic';
		const args: string[] = [];
		const bundle = process.env.CO_TECTONIC_BUNDLE;
		if (bundle) {
			args.push('--bundle', bundle);
		}
		if (options?.fast) {
			args.push('--reruns', '0', '--chatter', 'minimal');
		}
		args.push('--outdir', outDir, texPath);
		const child = spawn(cmd, args, { cwd: outDir, shell: process.platform === 'win32' });
		onProcess?.(child);
		child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
		child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
		child.on('error', (err: any) => {
			const notFound = err?.code === 'ENOENT';
			const friendly = notFound
				? 'Nao encontrei o Tectonic. Instale o Tectonic para gerar o PDF.'
				: 'Erro ao executar o Tectonic.';
			resolve({ ok: false, stdout, stderr: `${stderr}\n${err?.message ?? ''}`, friendly, notFound });
		});
		child.on('close', (code: number | null) => {
			if (code === 0) {
				resolve({ ok: true, stdout, stderr, friendly: '', notFound: false });
			} else {
				resolve({
					ok: false,
					stdout,
					stderr,
					friendly: 'Nao foi possivel gerar o PDF. Verifique a instalacao.',
					notFound: false
				});
			}
		});
	});
}
