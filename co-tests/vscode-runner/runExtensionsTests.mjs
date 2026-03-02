#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

const extensionName = process.argv[2];
if (!extensionName) {
	console.error('Usage: node co-tests/vscode-runner/runExtensionsTests.mjs <extension-name>');
	process.exit(2);
}

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, 'co-tests', 'config', 'ext-workspaces.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const workspaceRelative = config[extensionName];
if (!workspaceRelative) {
	console.error(`No workspace mapping found for ${extensionName} in ${configPath}`);
	process.exit(2);
}

const extensionDevelopmentPath = path.join(repoRoot, 'extensions', extensionName);
const extensionTestsPath = path.join(extensionDevelopmentPath, 'out', 'test', 'run.js');
const workspacePath = path.join(repoRoot, workspaceRelative);

if (!fs.existsSync(extensionDevelopmentPath)) {
	console.error(`Extension path not found: ${extensionDevelopmentPath}`);
	process.exit(2);
}
if (!fs.existsSync(extensionTestsPath)) {
	console.error(`Extension tests entrypoint not found: ${extensionTestsPath}`);
	process.exit(2);
}
if (!fs.existsSync(workspacePath)) {
	console.error(`Workspace path not found: ${workspacePath}`);
	process.exit(2);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `co-tests-user-${extensionName}-`));
const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), `co-tests-ext-${extensionName}-`));

const launchArgs = [
	`--user-data-dir=${userDataDir}`,
	`--extensions-dir=${extensionsDir}`,
	'--disable-telemetry',
	'--disable-updates',
	'--disable-workspace-trust',
	'--skip-release-notes',
	'--skip-welcome'
];

try {
	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs,
		extensionTestsEnv: {
			CO_TESTING: '1',
			TECTONIC_PATH: '__missing__',
			CO_TEST_WORKSPACE: workspacePath
		}
	});
} finally {
	fs.rmSync(userDataDir, { recursive: true, force: true });
	fs.rmSync(extensionsDir, { recursive: true, force: true });
}
