/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productPath = path.join(root, 'product.json');
const product = JSON.parse(await fsp.readFile(productPath, 'utf8'));
const extensions = (product.builtInExtensions ?? []).filter(ext => ext.vsix);

if (extensions.length === 0) {
	console.log('No built-in extensions configured with local VSIX paths.');
	process.exit(0);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT;
const headers = {
	'User-Agent': 'co-builtin-vsix',
	'Accept': 'application/vnd.github+json'
};
if (token) {
	headers['Authorization'] = `Bearer ${token}`;
}

async function fetchJson(url) {
	const res = await fetch(url, { headers });
	if (res.status === 404) {
		return null;
	}
	if (!res.ok) {
		const remaining = res.headers.get('x-ratelimit-remaining');
		if (res.status === 403 && remaining === '0') {
			throw new Error(`GitHub API rate limit exceeded. Set GITHUB_TOKEN and retry. (${url})`);
		}
		const body = await res.text();
		throw new Error(`GitHub API error ${res.status}: ${body || res.statusText} (${url})`);
	}
	return res.json();
}

function parseRepo(repoUrl) {
	const url = new URL(repoUrl);
	const parts = url.pathname.replace(/^\/+/, '').split('/');
	if (parts.length < 2) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `${parts[0]}/${parts[1]}`;
}

function pickVsixAsset(assets, extensionName, repoSlug) {
	const vsixAssets = assets.filter(asset => asset?.name?.toLowerCase().endsWith('.vsix'));
	if (vsixAssets.length === 0) {
		return null;
	}
	if (vsixAssets.length === 1) {
		return vsixAssets[0];
	}
	const normalized = extensionName.toLowerCase();
	const shortName = normalized.split('.').slice(1).join('.');
	const candidates = new Set([
		normalized,
		shortName,
		repoSlug.toLowerCase(),
		repoSlug.toLowerCase().replace(/^vscode-/, '')
	]);
	for (const candidate of candidates) {
		const match = vsixAssets.find(asset => asset.name.toLowerCase().includes(candidate));
		if (match) {
			return match;
		}
	}
	return vsixAssets[0];
}

async function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

async function downloadFile(url, destination) {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Download failed ${res.status}: ${res.statusText} (${url})`);
	}
	if (!res.body) {
		throw new Error(`No response body while downloading ${url}`);
	}
	await fsp.mkdir(path.dirname(destination), { recursive: true });
	await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destination));
}

async function getRelease(repo, version) {
	const tags = [`v${version}`, version];
	for (const tag of tags) {
		const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
		if (release) {
			return release;
		}
	}
	const releases = await fetchJson(`https://api.github.com/repos/${repo}/releases?per_page=50`);
	if (Array.isArray(releases)) {
		const match = releases.find(release => release.tag_name === `v${version}` || release.tag_name === version);
		if (match) {
			return match;
		}
	}
	return null;
}

let failures = 0;

for (const extension of extensions) {
	const destPath = path.isAbsolute(extension.vsix)
		? extension.vsix
		: path.join(root, extension.vsix);

	if (fs.existsSync(destPath)) {
		const checksum = await sha256File(destPath);
		if (checksum === extension.sha256) {
			console.log(`✔ ${extension.name}@${extension.version} already present`);
			continue;
		}
		console.log(`re ${extension.name}@${extension.version} checksum mismatch, re-downloading`);
	}

	const repo = parseRepo(extension.repo);
	const repoSlug = repo.split('/')[1];
	const release = await getRelease(repo, extension.version);
	if (!release) {
		console.error(`x Could not find release for ${extension.name} (${extension.version}) in ${repo}`);
		failures += 1;
		continue;
	}

	const asset = pickVsixAsset(release.assets ?? [], extension.name, repoSlug);
	if (!asset) {
		console.error(`x No VSIX assets found for ${extension.name} (${extension.version}) in ${repo}`);
		failures += 1;
		continue;
	}

	console.log(`↓ ${extension.name}@${extension.version} from ${asset.name}`);
	await downloadFile(asset.browser_download_url, destPath);

	const checksum = await sha256File(destPath);
	if (checksum !== extension.sha256) {
		console.error(`x Checksum mismatch for ${extension.name}@${extension.version}`);
		failures += 1;
		continue;
	}
	console.log(`✔ ${extension.name}@${extension.version} ready`);
}

if (failures > 0) {
	process.exit(1);
}
