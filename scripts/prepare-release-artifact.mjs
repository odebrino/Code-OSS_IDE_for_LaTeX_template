/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { create as createTar } from 'tar';

const repoRoot = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (!options.target) {
		printUsageAndExit();
	}

	const packageJson = readJson(path.join(repoRoot, 'package.json'));
	const targetSuffix = options.target.replace(/^vscode-/, '');
	const outputDir = path.resolve(repoRoot, options.outputDir ?? path.join('..', `VSCode-${targetSuffix}`));

	if (!options.skipFetch) {
		run(npmCommand, ['run', 'fetch-builtin-vsix']);
	}

	if (!options.skipBuild) {
		run(npmCommand, ['run', 'gulp', options.target]);
	}

	const stat = safeStat(outputDir);
	if (!stat?.isDirectory()) {
		throw new Error(`Expected build output directory at ${toPosix(path.relative(repoRoot, outputDir)) || '.'}`);
	}

	const commit = firstNonEmpty(
		process.env.GITHUB_SHA,
		process.env.BUILD_SOURCEVERSION,
		runGit(['rev-parse', 'HEAD'])
	) ?? 'unknown';
	const shortCommit = /^[0-9a-f]{40}$/i.test(commit) ? commit.slice(0, 12) : sanitizeSegment(commit).slice(0, 12) || 'unknown';
	const branch = firstNonEmpty(
		process.env.GITHUB_REF_NAME,
		process.env.BUILD_SOURCEBRANCHNAME,
		runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
	) ?? 'unknown';
	const dirty = Boolean((runGit(['status', '--porcelain']) ?? '').trim());
	const artifactName = [
		sanitizeSegment(packageJson.name ?? 'artifact'),
		sanitizeSegment(packageJson.version ?? '0.0.0'),
		sanitizeSegment(options.target),
		shortCommit,
		dirty ? 'dirty' : ''
	].filter(Boolean).join('-');

	const manifestDir = path.join(repoRoot, '.build', 'release');
	fs.mkdirSync(manifestDir, { recursive: true });
	const archivePath = path.join(manifestDir, `${artifactName}.tar.gz`);
	const checksumPath = `${archivePath}.sha256`;
	const manifestPath = path.join(manifestDir, `${artifactName}.json`);
	const topLevelEntries = fs.readdirSync(outputDir, { withFileTypes: true })
		.map((entry) => ({
			name: entry.name,
			kind: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	await createArchive(outputDir, archivePath);
	const archiveSha256 = await sha256File(archivePath);
	fs.writeFileSync(checksumPath, `${archiveSha256}  ${path.basename(archivePath)}\n`, 'utf8');

	const manifest = {
		schemaVersion: 1,
		artifactName,
		artifactType: 'unsigned-product-build',
		target: options.target,
		outputDir: toPosix(path.relative(repoRoot, outputDir)),
		outputDirName: path.basename(outputDir),
		generatedAt: new Date().toISOString(),
		product: {
			name: packageJson.name,
			version: packageJson.version,
			distro: packageJson.distro
		},
		source: {
			commit,
			shortCommit,
			branch,
			dirty
		},
		build: {
			skipFetch: options.skipFetch,
			skipBuild: options.skipBuild,
			githubWorkflow: process.env.GITHUB_WORKFLOW,
			githubRunId: process.env.GITHUB_RUN_ID,
			azureBuildId: process.env.BUILD_BUILDID
		},
		bundle: {
			archivePath: toPosix(path.relative(repoRoot, archivePath)),
			archiveFileName: path.basename(archivePath),
			checksumPath: toPosix(path.relative(repoRoot, checksumPath)),
			sha256: archiveSha256
		},
		contents: {
			topLevelEntries
		}
	};

	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

	const manifestRelativePath = toPosix(path.relative(repoRoot, manifestPath));
	const archiveRelativePathForOutput = toPosix(path.relative(repoRoot, archivePath));
	const checksumRelativePath = toPosix(path.relative(repoRoot, checksumPath));
	const outputRelativePath = toPosix(path.relative(repoRoot, outputDir));
	console.log(`Prepared ${manifestRelativePath}`);
	console.log(`Archive: ${archiveRelativePathForOutput}`);
	console.log(`Checksum: ${checksumRelativePath}`);
	console.log(`Artifact: ${artifactName}`);
	console.log(`Output: ${outputRelativePath}`);

	setGithubOutput('artifact_name', artifactName);
	setGithubOutput('archive_path', archiveRelativePathForOutput);
	setGithubOutput('checksum_path', checksumRelativePath);
	setGithubOutput('manifest_path', manifestRelativePath);
	setGithubOutput('output_path', outputRelativePath);
	setGithubOutput('sha256', archiveSha256);
}

function parseArgs(args) {
	const options = {
		outputDir: undefined,
		skipBuild: false,
		skipFetch: false,
		target: undefined
	};

	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		switch (value) {
			case '--target':
				options.target = args[++index];
				break;
			case '--output-dir':
				options.outputDir = args[++index];
				break;
			case '--skip-build':
				options.skipBuild = true;
				break;
			case '--skip-fetch':
				options.skipFetch = true;
				break;
			default:
				throw new Error(`Unknown argument: ${value}`);
		}
	}

	return options;
}

function printUsageAndExit() {
	console.error('Usage: node scripts/prepare-release-artifact.mjs --target <gulp-target> [--output-dir <dir>] [--skip-fetch] [--skip-build]');
	process.exit(1);
}

function run(command, args) {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		stdio: 'inherit'
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

async function createArchive(outputDir, archivePath) {
	fs.rmSync(archivePath, { force: true });
	fs.rmSync(`${archivePath}.sha256`, { force: true });
	await createTar({
		cwd: path.dirname(outputDir),
		file: archivePath,
		gzip: true,
		noMtime: true,
		portable: true
	}, [path.basename(outputDir)]);
}

async function sha256File(filePath) {
	const hash = crypto.createHash('sha256');
	await new Promise((resolve, reject) => {
		const stream = fs.createReadStream(filePath);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('error', reject);
		stream.on('end', resolve);
	});
	return hash.digest('hex');
}

function runGit(args) {
	const result = spawnSync('git', args, {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
	if (result.status !== 0) {
		return undefined;
	}
	return result.stdout.trim();
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeStat(filePath) {
	try {
		return fs.statSync(filePath);
	} catch {
		return undefined;
	}
}

function sanitizeSegment(value) {
	return String(value).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function firstNonEmpty(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return undefined;
}

function setGithubOutput(name, value) {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (!outputPath) {
		return;
	}
	fs.appendFileSync(outputPath, `${name}=${String(value)}\n`, 'utf8');
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}
