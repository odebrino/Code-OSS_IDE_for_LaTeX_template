/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';

export type TemplateManifest = {
	id: string;
	name: string;
	version: string;
	description: string;
	entry: string;
	schema: Array<{ key: string; type: string; label: string }>;
};

type TemplateState = {
	templates: TemplateManifest[];
	selectedTemplateId?: string;
};

export type TemplateBuildResult = {
	ok: boolean;
	friendly: string;
	notFound: boolean;
};

const DEFAULT_TEMPLATE: TemplateManifest = {
	id: 'tarefa-default',
	name: 'Tarefa Default',
	version: '1.0.0',
	description: 'Template padrao para testes',
	entry: 'main.tex',
	schema: [{ key: 'Title', type: 'string', label: 'Titulo' }]
};

export class TemplateGeneratorHooks {
	private state: TemplateState = { templates: [], selectedTemplateId: undefined };

	constructor(private readonly workspaceRoot?: string) { }

	async initialize(): Promise<void> {
		const templates = await this.loadTemplatesFromWorkspace();
		this.state.templates = templates.length ? templates : [DEFAULT_TEMPLATE];
		this.state.selectedTemplateId = this.state.templates[0]?.id;
	}

	async listTemplatesNow(): Promise<TemplateManifest[]> {
		if (!this.state.templates.length) {
			await this.initialize();
		}
		return this.state.templates.map(item => ({ ...item, schema: [...item.schema] }));
	}

	selectTemplate(id: string): void {
		if (!id) {
			return;
		}
		if (this.state.templates.some(item => item.id === id)) {
			this.state.selectedTemplateId = id;
		}
	}

	getStateSnapshot(): { templates: TemplateManifest[]; selectedTemplateId?: string } {
		return {
			templates: this.state.templates.map(item => ({ ...item, schema: [...item.schema] })),
			selectedTemplateId: this.state.selectedTemplateId
		};
	}

	async buildPreviewNow(): Promise<TemplateBuildResult> {
		const tectonicPath = (process.env.TECTONIC_PATH ?? '').trim();
		if (!tectonicPath || tectonicPath === '__missing__' || !fsSync.existsSync(tectonicPath)) {
			return { ok: false, friendly: 'Tectonic nao encontrado.', notFound: true };
		}
		try {
			const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'co-template-generator-'));
			await fs.writeFile(path.join(outDir, 'preview.tex'), '\\documentclass{article}', 'utf8');
			await fs.rm(outDir, { recursive: true, force: true });
			return { ok: true, friendly: 'Preview gerado.', notFound: false };
		} catch {
			return { ok: false, friendly: 'Falha ao gerar preview.', notFound: false };
		}
	}

	private async loadTemplatesFromWorkspace(): Promise<TemplateManifest[]> {
		if (!this.workspaceRoot) {
			return [];
		}
		const templatesRoot = path.join(this.workspaceRoot, '.co', 'templates');
		if (!fsSync.existsSync(templatesRoot)) {
			return [];
		}
		const manifests: TemplateManifest[] = [];
		const entries = await fs.readdir(templatesRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const manifestPath = path.join(templatesRoot, entry.name, 'template.json');
			if (!fsSync.existsSync(manifestPath)) {
				continue;
			}
			try {
				const raw = await fs.readFile(manifestPath, 'utf8');
				const parsed = JSON.parse(raw) as TemplateManifest;
				if (!parsed.id || !parsed.name || !parsed.entry || !Array.isArray(parsed.schema)) {
					continue;
				}
				manifests.push(parsed);
			} catch {
				// ignore invalid template file
			}
		}
		return manifests;
	}
}
