/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const docsInventoryPath = path.join(repoRoot, 'docs', 'dependency-inventory.md');
const ignoredDirs = new Set([
	'.build',
	'.git',
	'.vscode-test',
	'coverage',
	'dist',
	'node_modules',
	'out',
	'out-build',
	'test-results'
]);
const manifestNames = new Set([
	'Cargo.lock',
	'Cargo.toml',
	'npm-shrinkwrap.json',
	'package-lock.json',
	'package.json',
	'pnpm-lock.yaml',
	'yarn.lock'
]);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const primaryNpmManifests = [
	{ path: 'package.json', role: 'Product root' },
	{ path: 'build/package.json', role: 'Build toolchain' },
	{ path: 'remote/web/package.json', role: 'Web runtime' },
	{ path: 'extensions/latex-workshop/package.json', role: 'Embedded LaTeX extension' },
	{ path: 'packages/co-doc-core/package.json', role: 'CO shared package' },
	{ path: 'packages/co-preview-core/package.json', role: 'CO shared package' },
	{ path: 'packages/co-storage-core/package.json', role: 'CO shared package' },
	{ path: 'packages/co-template-core/package.json', role: 'CO shared package' },
	{ path: 'extensions/co-diagramador/package.json', role: 'CO extension' },
	{ path: 'extensions/co-data-set/package.json', role: 'CO extension' },
	{ path: 'extensions/co-correcao/package.json', role: 'CO extension' },
	{ path: 'extensions/co-shell/package.json', role: 'CO extension' },
	{ path: 'extensions/co-template-generator/package.json', role: 'CO extension' },
	{ path: 'test/automation/package.json', role: 'UI automation harness' },
	{ path: 'test/smoke/package.json', role: 'Smoke test harness' },
	{ path: 'test/sanity/package.json', role: 'Sanity test harness' },
	{ path: 'test/mcp/package.json', role: 'MCP test harness' }
];

const primaryCargoManifests = [
	{ path: 'cli/Cargo.toml', role: 'Rust CLI' },
	{ path: 'build/win32/Cargo.toml', role: 'Windows updater helper' }
];

const sbomTargets = [
	{
		id: 'root',
		label: 'Repo root',
		cwd: repoRoot,
		output: path.join(repoRoot, 'docs', 'dependency-root.cyclonedx.json')
	},
	{
		id: 'build',
		label: 'Build toolchain',
		cwd: path.join(repoRoot, 'build'),
		output: path.join(repoRoot, 'docs', 'dependency-build.cyclonedx.json')
	},
	{
		id: 'remote-web',
		label: 'Remote web',
		cwd: path.join(repoRoot, 'remote', 'web'),
		output: path.join(repoRoot, 'docs', 'dependency-remote-web.cyclonedx.json')
	},
	{
		id: 'latex-workshop',
		label: 'LaTeX Workshop',
		cwd: path.join(repoRoot, 'extensions', 'latex-workshop'),
		output: path.join(repoRoot, 'docs', 'dependency-latex-workshop.cyclonedx.json')
	}
];

const rootRuntimeHighlights = [
	'@parcel/watcher',
	'@vscode/sqlite3',
	'@vscode/spdlog',
	'@xterm/addon-webgl',
	'@xterm/xterm',
	'katex',
	'kerberos',
	'native-keymap',
	'node-pty',
	'open',
	'tas-client',
	'undici',
	'vscode-oniguruma',
	'vscode-textmate'
];

const rootDevHighlights = [
	'@playwright/test',
	'@typescript/native-preview',
	'@vscode/test-electron',
	'electron',
	'eslint',
	'event-stream',
	'glob',
	'gulp',
	'husky',
	'mocha',
	'rimraf',
	'source-map',
	'source-map-support',
	'tsec',
	'typescript',
	'webpack'
];

const buildHighlights = [
	'@azure/cosmos',
	'@azure/identity',
	'@azure/storage-blob',
	'@vscode/vsce',
	'dmg-builder',
	'esbuild',
	'tree-sitter',
	'vscode-universal-bundler',
	'zx'
];

const testHarnessHighlights = [
	'@modelcontextprotocol/sdk',
	'axe-core',
	'mocha',
	'node-fetch',
	'npm-run-all2',
	'playwright',
	'tmp',
	'tree-kill'
];

main();

function main() {
	const manifests = walk(repoRoot).sort();
	const manifestCounts = countByExtension(manifests);
	const categoryCounts = countByCategory(manifests);
	const packageData = new Map(primaryNpmManifests.map(item => [item.path, readJson(item.path)]));
	const cargoData = new Map(primaryCargoManifests.map(item => [item.path, parseCargoToml(item.path)]));
	const sbomSummaries = sbomTargets.map(generateSbom);
	const markdown = buildMarkdown({
		manifestCounts,
		categoryCounts,
		packageData,
		cargoData,
		sbomSummaries
	});

	fs.writeFileSync(docsInventoryPath, markdown, 'utf8');
	console.log(`Wrote ${toPosix(path.relative(repoRoot, docsInventoryPath))}`);
	for (const summary of sbomSummaries) {
		console.log(`Wrote ${summary.output}`);
	}
}

function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const results = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (ignoredDirs.has(entry.name)) {
				continue;
			}
			results.push(...walk(fullPath));
			continue;
		}
		if (entry.isFile() && manifestNames.has(entry.name)) {
			results.push(toPosix(path.relative(repoRoot, fullPath)));
		}
	}

	return results;
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function parseCargoToml(relativePath) {
	const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
	const lines = source.split(/\r?\n/);
	let section = '';
	const result = {
		name: undefined,
		version: undefined,
		dependencies: [],
		buildDependencies: [],
		targetDependencies: [],
		patches: []
	};

	for (const rawLine of lines) {
		const line = rawLine.replace(/\s+#.*$/, '').trim();
		if (!line) {
			continue;
		}

		const sectionMatch = line.match(/^\[(.+)\]$/);
		if (sectionMatch) {
			section = sectionMatch[1];
			continue;
		}

		if (section === 'package') {
			const stringMatch = line.match(/^(name|version)\s*=\s*"([^"]+)"/);
			if (stringMatch) {
				if (stringMatch[1] === 'name') {
					result.name = stringMatch[2];
				} else if (stringMatch[1] === 'version') {
					result.version = stringMatch[2];
				}
			}
			continue;
		}

		const dependencyMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
		if (!dependencyMatch) {
			continue;
		}

		const dependencyName = dependencyMatch[1];
		if (section === 'dependencies') {
			result.dependencies.push(dependencyName);
		} else if (section === 'build-dependencies') {
			result.buildDependencies.push(dependencyName);
		} else if (/^target\..+\.dependencies$/.test(section)) {
			result.targetDependencies.push(dependencyName);
		} else if (section === 'patch.crates-io') {
			result.patches.push(dependencyName);
		}
	}

	result.dependencies = sortUnique(result.dependencies);
	result.buildDependencies = sortUnique(result.buildDependencies);
	result.targetDependencies = sortUnique(result.targetDependencies);
	result.patches = sortUnique(result.patches);
	return result;
}

function sortUnique(values) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function countByExtension(manifests) {
	const counts = new Map();
	for (const manifest of manifests) {
		const key = path.basename(manifest);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function manifestCategory(relativePath) {
	if (relativePath === 'package.json' || relativePath === 'package-lock.json') {
		return 'Product root';
	}
	if (relativePath.startsWith('build/')) {
		return 'Build toolchain';
	}
	if (relativePath.startsWith('packages/co-')) {
		return 'CO shared packages';
	}
	if (relativePath.startsWith('extensions/co-')) {
		return 'CO extensions';
	}
	if (relativePath.startsWith('extensions/latex-workshop/')) {
		return 'Embedded LaTeX extension';
	}
	if (relativePath.startsWith('extensions/')) {
		return 'Upstream VS Code extensions';
	}
	if (relativePath.startsWith('remote/')) {
		return 'Remote/web';
	}
	if (relativePath.startsWith('test/')) {
		return 'Tests';
	}
	if (relativePath.startsWith('cli/')) {
		return 'Rust CLI';
	}
	if (relativePath.startsWith('.vscode/')) {
		return 'Developer helper extensions';
	}
	if (relativePath.startsWith('.eslint-plugin-local/')) {
		return 'Developer helpers';
	}
	if (relativePath.startsWith('scripts/')) {
		return 'Scripts';
	}
	return 'Other';
}

function countByCategory(manifests) {
	const counts = new Map();
	for (const manifest of manifests) {
		const key = manifestCategory(manifest);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function npmCounts(pkg) {
	return {
		runtime: Object.keys(pkg.dependencies ?? {}).length,
		dev: Object.keys(pkg.devDependencies ?? {}).length,
		optional: Object.keys(pkg.optionalDependencies ?? {}).length,
		peer: Object.keys(pkg.peerDependencies ?? {}).length
	};
}

function cargoCounts(cargo) {
	return {
		runtime: cargo.dependencies.length,
		build: cargo.buildDependencies.length,
		target: cargo.targetDependencies.length,
		patches: cargo.patches.length
	};
}

function formatCountSummary(counts) {
	const parts = [];
	if (counts.runtime) {
		parts.push(`${counts.runtime} runtime`);
	}
	if (counts.dev) {
		parts.push(`${counts.dev} dev`);
	}
	if (counts.optional) {
		parts.push(`${counts.optional} optional`);
	}
	if (counts.peer) {
		parts.push(`${counts.peer} peer`);
	}
	return parts.length ? parts.join(' / ') : '0 direct deps';
}

function formatCargoCountSummary(counts) {
	const parts = [];
	if (counts.runtime) {
		parts.push(`${counts.runtime} runtime`);
	}
	if (counts.build) {
		parts.push(`${counts.build} build`);
	}
	if (counts.target) {
		parts.push(`${counts.target} target-specific`);
	}
	if (counts.patches) {
		parts.push(`${counts.patches} patched crates`);
	}
	return parts.length ? parts.join(' / ') : '0 direct crates';
}

function pickSpecs(pkg, names, groups = ['dependencies', 'devDependencies', 'optionalDependencies']) {
	const values = [];
	for (const name of names) {
		for (const group of groups) {
			const spec = pkg[group]?.[name];
			if (spec) {
				values.push(`\`${name}@${spec}\``);
				break;
			}
		}
	}
	return values.join(', ');
}

function formatDependencyMap(values) {
	const items = sortUnique(Object.entries(values).map(([name, spec]) => `\`${name}@${spec}\``));
	return items.length ? items.join(', ') : 'none';
}

function generateSbom(target) {
	const result = spawnSync(
		npmCommand,
		['sbom', '--sbom-format', 'cyclonedx', '--package-lock-only'],
		{
			cwd: target.cwd,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024
		}
	);

	if (result.status !== 0) {
		throw new Error(`Failed to generate SBOM for ${target.label}: ${result.stderr || result.stdout}`);
	}

	const bom = JSON.parse(result.stdout);
	fs.writeFileSync(target.output, result.stdout, 'utf8');
	return {
		label: target.label,
		output: toPosix(path.relative(repoRoot, target.output)),
		component: bom.metadata?.component?.name ?? target.id,
		components: bom.components?.length ?? 0,
		dependencies: bom.dependencies?.length ?? 0
	};
}

function table(headers, rows) {
	const separator = headers.map(() => '---');
	return [
		`| ${headers.join(' | ')} |`,
		`| ${separator.join(' | ')} |`,
		...rows.map(row => `| ${row.join(' | ')} |`)
	].join('\n');
}

function buildMarkdown(context) {
	const {
		manifestCounts,
		categoryCounts,
		packageData,
		cargoData,
		sbomSummaries
	} = context;
	const rootPkg = packageData.get('package.json');
	const buildPkg = packageData.get('build/package.json');
	const remoteWebPkg = packageData.get('remote/web/package.json');
	const latexWorkshopPkg = packageData.get('extensions/latex-workshop/package.json');
	const cliCargo = cargoData.get('cli/Cargo.toml');
	const win32Cargo = cargoData.get('build/win32/Cargo.toml');
	const npmVersion = spawnSync(npmCommand, ['--version'], { encoding: 'utf8' }).stdout.trim();
	const coPackageRows = primaryNpmManifests
		.filter(item => item.path.startsWith('packages/co-') || item.path.startsWith('extensions/co-'))
		.map(item => {
			const pkg = packageData.get(item.path);
			return [
				`\`${item.path}\``,
				pkg.name ?? 'unknown',
				formatCountSummary(npmCounts(pkg))
			];
		});
	const primaryRows = [
		...primaryNpmManifests.map(item => {
			const pkg = packageData.get(item.path);
			return [
				`\`${item.path}\``,
				'npm',
				item.role,
				`\`${pkg.name ?? 'unknown'}@${pkg.version ?? '0.0.0'}\``,
				formatCountSummary(npmCounts(pkg))
			];
		}),
		...primaryCargoManifests.map(item => {
			const cargo = cargoData.get(item.path);
			return [
				`\`${item.path}\``,
				'cargo',
				item.role,
				`\`${cargo.name ?? 'unknown'}@${cargo.version ?? '0.0.0'}\``,
				formatCargoCountSummary(cargoCounts(cargo))
			];
		})
	];
	const manifestSummaryRows = sortUnique([...manifestCounts.keys()]).map(key => [
		`\`${key}\``,
		String(manifestCounts.get(key))
	]);
	const categoryRows = sortUnique([...categoryCounts.keys()]).map(key => [
		key,
		String(categoryCounts.get(key))
	]);
	const sbomRows = sbomSummaries.map(summary => [
		summary.label,
		`\`${summary.output}\``,
		`\`${summary.component}\``,
		String(summary.components),
		String(summary.dependencies)
	]);

	return `# Dependency Inventory

Regenerate this file and the npm SBOM outputs with:

\`\`\`bash
npm run co:deps:inventory
\`\`\`

The command refreshes this Markdown report and writes ignored CycloneDX files to \`docs/*.cyclonedx.json\`.

## Manifest Summary

${table(['Manifest', 'Count'], manifestSummaryRows)}

## Manifest Categories

${table(['Category', 'Count'], categoryRows)}

The scan excludes vendored/generated trees such as \`node_modules/\`, \`.build/\`, \`out/\`, \`out-build/\` and \`.vscode-test/\`.

## Primary Manifests

${table(['Path', 'Ecosystem', 'Role', 'Package', 'Direct deps'], primaryRows)}

## Direct Dependency Inventory

### Product Root

- Runtime direct deps (${Object.keys(rootPkg.dependencies ?? {}).length} total): ${pickSpecs(rootPkg, rootRuntimeHighlights, ['dependencies'])}
- Dev/build direct deps (${Object.keys(rootPkg.devDependencies ?? {}).length} total): ${pickSpecs(rootPkg, rootDevHighlights, ['devDependencies'])}
- Optional deps (${Object.keys(rootPkg.optionalDependencies ?? {}).length} total): ${formatDependencyMap(rootPkg.optionalDependencies ?? {})}

### Build and Runtime Side Graphs

- \`build/package.json\` highlights: ${pickSpecs(buildPkg, buildHighlights, ['devDependencies', 'optionalDependencies'])}
- \`remote/web/package.json\` runtime deps (${Object.keys(remoteWebPkg.dependencies ?? {}).length} total): ${formatDependencyMap(remoteWebPkg.dependencies ?? {})}
- \`extensions/latex-workshop/package.json\` runtime deps (${Object.keys(latexWorkshopPkg.dependencies ?? {}).length} total): ${formatDependencyMap(latexWorkshopPkg.dependencies ?? {})}
- \`extensions/latex-workshop/package.json\` dev deps (${Object.keys(latexWorkshopPkg.devDependencies ?? {}).length} total): ${pickSpecs(latexWorkshopPkg, [
	'@types/node',
	'@types/vscode',
	'@vscode/test-electron',
	'@vscode/vsce',
	'c8',
	'eslint',
	'mocha',
	'secretlint',
	'typescript'
], ['devDependencies'])}

### CO Modules

${table(['Path', 'Package', 'Direct deps'], coPackageRows)}

- \`extensions/co-diagramador/package.json\` runtime deps: ${formatDependencyMap(packageData.get('extensions/co-diagramador/package.json').dependencies ?? {})}
- \`extensions/co-data-set/package.json\` runtime deps: ${formatDependencyMap(packageData.get('extensions/co-data-set/package.json').dependencies ?? {})}
- \`extensions/co-correcao/package.json\` runtime deps: ${formatDependencyMap(packageData.get('extensions/co-correcao/package.json').dependencies ?? {})}
- \`extensions/co-shell/package.json\` and \`extensions/co-template-generator/package.json\` have no third-party runtime deps.

### Test Harnesses

- Test/runtime highlights: ${pickSpecs(packageData.get('test/sanity/package.json'), testHarnessHighlights, ['dependencies', 'devDependencies'])}, ${pickSpecs(packageData.get('test/mcp/package.json'), testHarnessHighlights, ['dependencies', 'devDependencies'])}, ${pickSpecs(packageData.get('test/automation/package.json'), testHarnessHighlights, ['dependencies', 'devDependencies'])}
- \`test/smoke/package.json\` runtime deps: ${formatDependencyMap(packageData.get('test/smoke/package.json').dependencies ?? {})}

### Rust Components

- \`cli/Cargo.toml\` runtime crates (${cliCargo.dependencies.length} total): ${cliCargo.dependencies.map(name => `\`${name}\``).join(', ')}
- \`cli/Cargo.toml\` build crates (${cliCargo.buildDependencies.length} total): ${cliCargo.buildDependencies.map(name => `\`${name}\``).join(', ')}
- \`cli/Cargo.toml\` target-specific crates (${cliCargo.targetDependencies.length} total): ${cliCargo.targetDependencies.map(name => `\`${name}\``).join(', ')}
- \`cli/Cargo.toml\` patched/git crates (${cliCargo.patches.length} total): ${cliCargo.patches.map(name => `\`${name}\``).join(', ')}
- \`build/win32/Cargo.toml\` crates (${win32Cargo.dependencies.length} total): ${win32Cargo.dependencies.map(name => `\`${name}\``).join(', ')}

## SBOM Targets

The repository can generate CycloneDX without extra tooling because npm ${npmVersion} already ships \`npm sbom\`.

${table(['Target', 'Output', 'Component', 'Components', 'Dependency edges'], sbomRows)}

Current SBOM coverage is intentionally focused on the largest npm lockfile islands that affect product/runtime/build behavior:

- repo root
- \`build/\`
- \`remote/web/\`
- \`extensions/latex-workshop/\`

Rust manifests are inventoried here but do not yet have a built-in SBOM generator wired into the repository.

## Initial Supply-Chain Priorities

1. Git-sourced Rust crates in \`cli/Cargo.toml\`: \`tunnels\` is pinned to a Git revision, and \`russh\`, \`russh-cryptovec\`, \`russh-keys\` are patched from a Git branch. These are reproducibility and provenance hotspots.
2. Native/prebuilt dependencies in the root graph: ${pickSpecs(rootPkg, ['@parcel/watcher', '@vscode/sqlite3', '@vscode/spdlog', 'kerberos', 'native-keymap', 'node-pty'], ['dependencies'])}. These deserve priority in vulnerability review because they mix native code, ABI sensitivity and platform-specific packaging.
3. Prerelease dependency lines in production/build paths: ${pickSpecs(rootPkg, ['@xterm/addon-clipboard', '@xterm/addon-image', '@xterm/addon-ligatures', '@xterm/addon-progress', '@xterm/addon-search', '@xterm/addon-serialize', '@xterm/addon-unicode11', '@xterm/addon-webgl', '@xterm/headless', '@xterm/xterm', 'node-pty'], ['dependencies'])}, plus \`@typescript/native-preview@${rootPkg.devDependencies?.['@typescript/native-preview']}\` and \`typescript@${rootPkg.devDependencies?.typescript}\` on the TypeScript toolchain side.
4. Older legacy packages still present in the root build graph: ${pickSpecs(rootPkg, ['event-stream', 'glob', 'husky', 'mime', 'rimraf', 'source-map', 'source-map-support'], ['devDependencies'])}. They are not being upgraded here, but they should be first in line for future review.
5. Separate lockfile islands mean a single root scan is insufficient. At minimum, vulnerability scanning must cover \`package-lock.json\`, \`build/package-lock.json\`, \`remote/web/package-lock.json\`, \`extensions/latex-workshop/package-lock.json\`, the CO extension/package lockfiles, and the test harness lockfiles.
`;
}
