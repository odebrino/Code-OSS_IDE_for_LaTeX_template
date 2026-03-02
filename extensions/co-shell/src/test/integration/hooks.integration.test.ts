/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createCoShellTestingHooks } from '../../testing/hooks';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Shell Hooks Integration (Headless)', () => {
	test('resolve + load + isAdminEmail funciona ponta a ponta', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-shell-hooks-'));
		const extensionPath = path.join(root, 'extensions', 'co-shell');
		const secretAdmins = path.join(root, 'co-secret', 'config', 'admins.json');
		await fs.mkdir(path.dirname(secretAdmins), { recursive: true });
		await fs.mkdir(path.join(extensionPath, 'config'), { recursive: true });
		await fs.writeFile(secretAdmins, JSON.stringify({ admins: ['admin@example.com'] }), 'utf8');
		await fs.writeFile(path.join(extensionPath, 'config', 'admins.template.json'), JSON.stringify({ admins: [] }), 'utf8');

		try {
			const hooks = createCoShellTestingHooks({
				extensionPath,
				cwd: root,
				existsSync: target => {
					try {
						require('fs').statSync(target);
						return true;
					} catch {
						return false;
					}
				}
			});

			const candidates = hooks.resolveAdminsPathCandidates();
			assert.ok(candidates.some(item => item.endsWith('/co-secret/config/admins.json')));
			const admins = await hooks.loadAdminsFrom();
			assert.deepStrictEqual(admins, ['admin@example.com']);
			assert.strictEqual(await hooks.isAdminEmail('admin@example.com'), true);
			assert.strictEqual(await hooks.isAdminEmail('guest@example.com'), false);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
