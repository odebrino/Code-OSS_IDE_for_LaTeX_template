/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type FieldType = 'string' | 'string[]';

export type CorrectionOp = {
	op: 'replace' | 'insert' | 'comment';
	start?: number;
	end?: number;
	at?: number;
	text: string;
	status?: 'pending' | 'accepted' | 'rejected';
};

export type CorrectionBaseFile = {
	baseHash: string;
	createdAt: string;
	taskId: string;
	templateId: string;
	fieldKey: string;
	fieldType: FieldType;
	text: string;
};

export type CorrectionIndexFile = {
	baseHash: string;
	revisions: Array<{ id: string; createdAt: string; parent: string | 'base' }>;
};

export type CorrectionRevisionFile = {
	id: string;
	parent: string | 'base';
	baseHash: string;
	createdAt: string;
	ops: CorrectionOp[];
};

export function normalizeCorrectionBaseFile(value: unknown): CorrectionBaseFile | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const baseHash = normalizeRequiredString(value.baseHash);
	const createdAt = normalizeRequiredString(value.createdAt);
	const taskId = normalizeRequiredString(value.taskId);
	const templateId = normalizeString(value.templateId);
	const fieldKey = normalizeRequiredString(value.fieldKey);
	const fieldType = normalizeFieldType(value.fieldType);
	if (!baseHash || !createdAt || !taskId || templateId === undefined || !fieldKey || !fieldType || typeof value.text !== 'string') {
		return undefined;
	}
	return {
		baseHash,
		createdAt,
		taskId,
		templateId,
		fieldKey,
		fieldType,
		text: value.text
	};
}

export function normalizeCorrectionIndexFile(value: unknown): CorrectionIndexFile | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const baseHash = normalizeRequiredString(value.baseHash);
	if (!baseHash || !Array.isArray(value.revisions)) {
		return undefined;
	}
	const revisions: CorrectionIndexFile['revisions'] = [];
	const seen = new Set<string>();
	for (const entry of value.revisions) {
		if (!isPlainObject(entry)) {
			continue;
		}
		const id = normalizeRequiredString(entry.id);
		const createdAt = normalizeRequiredString(entry.createdAt);
		const parent = normalizeParent(entry.parent);
		if (!id || !createdAt || !parent || seen.has(id)) {
			continue;
		}
		seen.add(id);
		revisions.push({ id, createdAt, parent });
	}
	return { baseHash, revisions };
}

export function normalizeCorrectionRevisionFile(value: unknown, expectedId?: string): CorrectionRevisionFile | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	const id = normalizeRequiredString(value.id);
	const parent = normalizeParent(value.parent);
	const baseHash = normalizeRequiredString(value.baseHash);
	const createdAt = normalizeRequiredString(value.createdAt);
	if (!id || !parent || !baseHash || !createdAt || !Array.isArray(value.ops)) {
		return undefined;
	}
	if (expectedId && id !== expectedId) {
		return undefined;
	}
	return {
		id,
		parent,
		baseHash,
		createdAt,
		ops: value.ops.map(normalizeCorrectionOp).filter((op): op is CorrectionOp => Boolean(op))
	};
}

function normalizeCorrectionOp(value: unknown): CorrectionOp | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}
	if ((value.op !== 'replace' && value.op !== 'insert' && value.op !== 'comment') || typeof value.text !== 'string') {
		return undefined;
	}
	const status = value.status === undefined || value.status === 'pending' || value.status === 'accepted' || value.status === 'rejected'
		? value.status
		: undefined;
	if (value.op === 'insert') {
		if (!Number.isInteger(value.at) || Number(value.at) < 0) {
			return undefined;
		}
		return {
			op: 'insert',
			at: Number(value.at),
			text: value.text,
			status
		};
	}
	if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || Number(value.start) < 0 || Number(value.end) < 0) {
		return undefined;
	}
	return {
		op: value.op,
		start: Number(value.start),
		end: Number(value.end),
		text: value.text,
		status
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequiredString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	return value.trim();
}

function normalizeFieldType(value: unknown): FieldType | undefined {
	return value === 'string' || value === 'string[]' ? value : undefined;
}

function normalizeParent(value: unknown): string | 'base' | undefined {
	const normalized = normalizeRequiredString(value);
	return normalized ? normalized : undefined;
}
