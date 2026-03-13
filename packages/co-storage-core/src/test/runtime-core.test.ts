/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalStorageProvider, resolveCoPaths, resolveCoPersistentPaths, resolveCoRuntimeDir } from '../index';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Storage Runtime', () => {
	test('reloca runtime oculto quando o tectonic vem do snap', async () => {
		const homeDir = path.join(path.sep, 'home', 'co-storage-home-hidden');
		const requestedBaseDir = path.join(homeDir, '.config', 'co-runtime');
		const result = await resolveCoRuntimeDir({
			featureName: 'diagramador',
			appName: 'CO Dev',
			configuredBaseDir: requestedBaseDir,
			homeDir,
			isSnapTectonic: true,
			platform: 'linux'
		});
		assert.strictEqual(result.relocated, true);
		assert.strictEqual(result.reason, 'hidden_path_under_snap');
		assert.match(result.baseDir, /CO-runtime/);
		assert.ok(!result.baseDir.includes(`${path.sep}.config${path.sep}`));
	});

	test('mantem runtime visivel quando configuracao e compativel', async () => {
		const homeDir = path.join(path.sep, 'home', 'co-storage-home-visible');
		const configuredBaseDir = path.join(homeDir, 'CO-runtime-custom');
		const result = await resolveCoRuntimeDir({
			featureName: 'correcao',
			appName: 'CO Dev',
			configuredBaseDir,
			homeDir,
			isSnapTectonic: true,
			platform: 'linux'
		});
		assert.strictEqual(result.relocated, false);
		assert.strictEqual(result.baseDir, path.join(configuredBaseDir, 'correcao'));
	});

	test('resolve caminhos persistentes do diagramador no workspace', () => {
		const persistent = resolveCoPersistentPaths({
			feature: 'diagramador',
			globalStoragePath: path.join(path.sep, 'home', 'co', '.config', 'Code', 'User', 'globalStorage', 'odebrino.co-correcao'),
			workspaceDir: path.join(path.sep, 'workspaces', 'co-aula'),
			saveDirOverride: undefined
		});
		assert.strictEqual(persistent.source, 'workspace');
		assert.strictEqual(persistent.baseDir, path.join(path.sep, 'workspaces', 'co-aula', '.co', 'diagramador'));
	});

	test('resolve caminhos persistentes do diagramador por override', () => {
		const persistent = resolveCoPersistentPaths({
			feature: 'diagramador',
			globalStoragePath: path.join(path.sep, 'home', 'co', '.config', 'Code', 'User', 'globalStorage', 'odebrino.co-diagramador'),
			saveDirOverride: path.join(path.sep, 'tmp', 'co-save-dir')
		});
		assert.strictEqual(persistent.source, 'override');
		assert.strictEqual(persistent.baseDir, path.join(path.sep, 'tmp', 'co-save-dir'));
	});

	test('resolve caminhos compartilhados com persistencia e runtime', async () => {
		const homeDir = path.join(path.sep, 'home', 'co-storage-home-shared');
		const resolution = await resolveCoPaths({
			feature: 'correcao',
			appName: 'CO Dev',
			globalStoragePath: path.join(homeDir, '.config', 'Code - OSS', 'User', 'globalStorage', 'odebrino.co-correcao'),
			workspaceDir: path.join(homeDir, 'workspace'),
			configuredRuntimeBaseDir: path.join(homeDir, '.config', 'hidden-runtime'),
			homeDir,
			isSnapTectonic: true,
			platform: 'linux'
		});
		assert.strictEqual(resolution.persistent.baseDir, path.join(homeDir, 'workspace', '.co', 'corrections'));
		assert.strictEqual(resolution.runtime.relocated, true);
		assert.strictEqual(resolution.runtime.reason, 'hidden_path_under_snap');
		assert.match(resolution.runtime.baseDir, /CO-runtime/);
	});

	test('rejeita paths relativos que escapam do diretorio base', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'co-storage-provider-'));
		const storage = new LocalStorageProvider(root);
		try {
			await assert.rejects(() => storage.writeFileAtomic('../escape.txt', 'blocked'), /escapes base directory/i);
			await assert.rejects(() => storage.readFile(path.join(path.sep, 'tmp', 'escape.txt')), /escapes base directory/i);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
