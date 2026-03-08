/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { collectWatchDirs, resolveDataSetScanRoots } from '../../scanRoots';

declare const suite: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void | Promise<void>) => void;

suite('CO Data Set Scan Roots', () => {
	test('usa runtime visivel e roots do workspace', async () => {
		const homeDir = path.join(path.sep, 'home', 'co-data-set-home');
		const roots = await resolveDataSetScanRoots({
			workspaceFolders: [{ name: 'Aula', fsPath: path.join(homeDir, 'workspace-aula') }],
			globalStoragePath: path.join(homeDir, '.config', 'Code', 'User', 'globalStorage', 'odebrino.co-data-set'),
			appName: 'CO Dev',
			configuredRuntimeBaseDir: path.join(homeDir, '.config', 'runtime-oculto'),
			platform: 'linux',
			homeDir,
			isSnapTectonic: true
		});
		assert.ok(roots.some(root => root.diagramadorDir === path.join(homeDir, 'workspace-aula', '.co', 'diagramador')));
		assert.ok(roots.some(root => root.runtimeDirs.some(dir => dir.includes(`${path.sep}CO-runtime${path.sep}`))));
	});

	test('watch dirs deduplicam roots compartilhados', () => {
		const dirs = collectWatchDirs([
			{
				id: 'a',
				label: 'A',
				location: 'workspace',
				baseDir: '/workspace/a',
				diagramadorDir: '/shared/diagramador',
				runtimeDirs: ['/shared/runtime/out', '/shared/runtime/template-preview'],
				templateDirs: ['/shared/templates']
			},
			{
				id: 'b',
				label: 'B',
				location: 'global',
				baseDir: '/workspace/b',
				diagramadorDir: '/shared/diagramador',
				runtimeDirs: ['/shared/runtime/out', '/shared/runtime/template-preview'],
				templateDirs: ['/shared/templates']
			}
		]);
		assert.deepStrictEqual(dirs, [
			'/shared/diagramador',
			'/shared/runtime/out',
			'/shared/runtime/template-preview',
			'/shared/templates'
		]);
	});
});
