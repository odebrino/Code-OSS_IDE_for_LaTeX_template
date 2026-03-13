/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	isAdminEmailForList,
	loadAdminsFrom,
	parseAdminsJson,
	resolveAdminPath,
	resolveAdminsPathCandidates,
	resolveExistingAdminsPath
} from '../../lib/admins';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Shell Admin Helpers', () => {
	test('parseAdminsJson normaliza emails', () => {
		const admins = parseAdminsJson(JSON.stringify({ admins: ['  ADMIN@EXAMPLE.COM ', 'teacher@example.com'] }));
		assert.deepStrictEqual(admins, ['admin@example.com', 'teacher@example.com']);
	});

	test('resolveAdminsPathCandidates inclui secret e template', () => {
		const candidates = resolveAdminsPathCandidates({ extensionPath: '/repo/extensions/co-shell', cwd: '/repo' });
		assert.ok(candidates.some(item => item.endsWith('/co-secret/config/admins.json')));
		assert.ok(candidates.some(item => item.endsWith('/extensions/co-shell/config/admins.template.json')));
	});

	test('resolveExistingAdminsPath retorna primeiro arquivo existente', () => {
		const ordered = resolveExistingAdminsPath(
			{ extensionPath: '/repo/extensions/co-shell', configuredPath: 'custom/admins.json', cwd: '/repo' },
			target => target.endsWith('/co-secret/config/admins.json')
		);
		assert.ok(ordered?.endsWith('/co-secret/config/admins.json'));
	});

	test('resolveAdminPath bloqueia caminho relativo com escape', () => {
		assert.strictEqual(resolveAdminPath('/repo/extensions/co-shell', '../admins.json'), undefined);
		assert.strictEqual(resolveAdminPath('/repo/extensions/co-shell', '../../co-secret/config/admins.json'), undefined);
	});

	test('resolveAdminsPathCandidates ignora configuracao relativa insegura', () => {
		const candidates = resolveAdminsPathCandidates({
			extensionPath: '/repo/extensions/co-shell',
			configuredPath: '../../co-secret/config/admins.json',
			cwd: '/repo'
		});
		assert.ok(!candidates.some(item => item.includes('/extensions/co-secret/')));
		assert.ok(candidates.some(item => item.endsWith('/co-secret/config/admins.json')));
	});

	test('loadAdminsFrom retorna vazio em arquivo invalido', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-shell-admins-'));
		const filePath = path.join(root, 'admins.json');
		await fs.writeFile(filePath, '{ invalid json', 'utf8');
		try {
			const admins = await loadAdminsFrom(filePath);
			assert.deepStrictEqual(admins, []);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('isAdminEmailForList valida true e false', () => {
		assert.strictEqual(isAdminEmailForList('Admin@Example.com', ['admin@example.com']), true);
		assert.strictEqual(isAdminEmailForList('guest@example.com', ['admin@example.com']), false);
	});
});
