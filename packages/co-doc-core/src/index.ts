/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const DEFAULT_TEMPLATE_ID = 'test_v0';

/**
 * Versioned CO project payload.
 */
export type CoProjectV1 = {
	schemaVersion: 1;
	templateId: string;
	data: Record<string, any>;
	meta?: {
		createdAt?: string;
		updatedAt?: string;
	};
};

/**
 * Parse a project payload when it matches schema version 1.
 */
export function parseProject(raw: string): CoProjectV1 | null {
	if (typeof raw !== 'string' || !raw.trim()) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Record<string, any>;
		return normalizeProject(parsed);
	} catch {
		return null;
	}
}

/**
 * Serialize a project payload to JSON.
 */
export function serializeProject(project: CoProjectV1): string {
	return JSON.stringify(project, null, 2);
}

/**
 * Migrate the legacy Diagramador project format into schema version 1.
 */
export function migrateLegacyProject(input: Record<string, any>): CoProjectV1 {
	if (isPlainObject(input) && input.schemaVersion === 1) {
		const normalized = normalizeProject(input);
		if (normalized) {
			return normalized;
		}
	}
	const templateId = normalizeTemplateId(input?.templateId) ?? DEFAULT_TEMPLATE_ID;
	const data = isPlainObject(input?.doc) ? clonePlainObject(input.doc) : {};
	return {
		schemaVersion: 1,
		templateId,
		data
	};
}

function normalizeProject(value: Record<string, any>): CoProjectV1 | null {
	if (!isPlainObject(value)) {
		return null;
	}
	if (value.schemaVersion !== 1) {
		return null;
	}
	const templateId = normalizeTemplateId(value.templateId);
	if (!templateId) {
		return null;
	}
	const data = isPlainObject(value.data) ? clonePlainObject(value.data) : {};
	const meta = normalizeMeta(value.meta);
	const project: CoProjectV1 = {
		schemaVersion: 1,
		templateId,
		data
	};
	if (meta) {
		project.meta = meta;
	}
	return project;
}

function normalizeTemplateId(value: any): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeMeta(value: any): { createdAt?: string; updatedAt?: string } | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const createdAt = normalizeOptionalString(value.createdAt);
	const updatedAt = normalizeOptionalString(value.updatedAt);
	if (!createdAt && !updatedAt) {
		return undefined;
	}
	return {
		...(createdAt ? { createdAt } : {}),
		...(updatedAt ? { updatedAt } : {})
	};
}

function normalizeOptionalString(value: any): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function isPlainObject(value: any): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clonePlainObject<T extends Record<string, any>>(value: T): T {
	return { ...value };
}
