/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { resolveCoRuntimeDir } from '../index';

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
});
