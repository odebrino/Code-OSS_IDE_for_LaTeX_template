/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

type CoShellTestApi = {
	__test: {
		resolveAdminsPathCandidates: () => string[];
		loadAdminsFrom: (filePath?: string) => Promise<string[]>;
		isAdminEmail: (email: string, admins?: string[]) => Promise<boolean>;
	};
};

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Shell Extension Integration', () => {
	test('ativa extensao sem throw', async () => {
		const extension = vscode.extensions.getExtension<CoShellTestApi>('odebrino.co-shell');
		assert.ok(extension);
		const api = await extension!.activate();
		assert.ok(api?.__test);
	});

	test('loadAdminsFrom faz parse deterministico', async () => {
		const extension = vscode.extensions.getExtension<CoShellTestApi>('odebrino.co-shell');
		assert.ok(extension);
		const api = await extension!.activate();
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-shell-int-'));
		const filePath = path.join(root, 'admins.json');
		await fs.writeFile(filePath, JSON.stringify({ admins: ['ADMIN@EXAMPLE.COM', 'teacher@example.com'] }), 'utf8');
		try {
			const admins = await api.__test.loadAdminsFrom(filePath);
			assert.deepStrictEqual(admins, ['admin@example.com', 'teacher@example.com']);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('isAdminEmail valida positivo e negativo', async () => {
		const extension = vscode.extensions.getExtension<CoShellTestApi>('odebrino.co-shell');
		assert.ok(extension);
		const api = await extension!.activate();
		assert.strictEqual(await api.__test.isAdminEmail('admin@example.com', ['admin@example.com']), true);
		assert.strictEqual(await api.__test.isAdminEmail('guest@example.com', ['admin@example.com']), false);
	});
});
