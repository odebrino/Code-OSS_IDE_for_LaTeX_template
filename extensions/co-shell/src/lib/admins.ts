/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

const ADMINS_SECRET_RELATIVE_PATH = path.join('co-secret', 'config', 'admins.json');
const ADMINS_TEMPLATE_RELATIVE_PATH = path.join('config', 'admins.template.json');

type ResolveCandidatesInput = {
	extensionPath: string;
	configuredPath?: string;
	cwd?: string;
};

export function resolveAdminPath(extensionPath: string, configuredPath: string): string {
	if (path.isAbsolute(configuredPath)) {
		return configuredPath;
	}
	return path.join(extensionPath, configuredPath);
}

export function resolveAdminsPathCandidates(input: ResolveCandidatesInput): string[] {
	const candidates: string[] = [];
	const configuredPath = input.configuredPath?.trim();
	if (configuredPath) {
		candidates.push(resolveAdminPath(input.extensionPath, configuredPath));
	}
	const repoRootFromExtension = path.resolve(input.extensionPath, '..', '..');
	candidates.push(path.join(repoRootFromExtension, ADMINS_SECRET_RELATIVE_PATH));
	const cwd = input.cwd?.trim() || process.cwd();
	candidates.push(path.join(cwd, ADMINS_SECRET_RELATIVE_PATH));
	candidates.push(path.join(input.extensionPath, ADMINS_TEMPLATE_RELATIVE_PATH));
	return dedupe(candidates);
}

export function resolveExistingAdminsPath(input: ResolveCandidatesInput, existsSync: (target: string) => boolean): string | undefined {
	for (const candidate of resolveAdminsPathCandidates(input)) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

export function parseAdminsJson(raw: string): string[] {
	try {
		const data = JSON.parse(raw) as { admins?: unknown };
		if (!Array.isArray(data.admins)) {
			return [];
		}
		return data.admins
			.map(value => typeof value === 'string' ? value.trim().toLowerCase() : '')
			.filter(Boolean);
	} catch {
		return [];
	}
}

export async function loadAdminsFrom(filePath: string): Promise<string[]> {
	try {
		const raw = await fs.readFile(filePath, 'utf8');
		return parseAdminsJson(raw);
	} catch {
		return [];
	}
}

export function isAdminEmailForList(email: string, admins: readonly string[]): boolean {
	const normalized = email.trim().toLowerCase();
	return admins.some(admin => admin === normalized);
}

function dedupe(values: string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];
	for (const value of values) {
		if (!seen.has(value)) {
			seen.add(value);
			output.push(value);
		}
	}
	return output;
}
