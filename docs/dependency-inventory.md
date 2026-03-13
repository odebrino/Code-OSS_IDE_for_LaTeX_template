# Dependency Inventory

Regenerate this file and the npm SBOM outputs with:

```bash
npm run co:deps:inventory
```

The command refreshes this Markdown report and writes ignored CycloneDX files to `docs/*.cyclonedx.json`.

## Manifest Summary

| Manifest | Count |
| --- | --- |
| `Cargo.lock` | 2 |
| `Cargo.toml` | 2 |
| `package-lock.json` | 62 |
| `package.json` | 131 |

## Manifest Categories

| Category | Count |
| --- | --- |
| Build toolchain | 10 |
| CO extensions | 9 |
| CO shared packages | 8 |
| Developer helper extensions | 4 |
| Developer helpers | 1 |
| Embedded LaTeX extension | 2 |
| Product root | 2 |
| Remote/web | 4 |
| Rust CLI | 2 |
| Scripts | 1 |
| Tests | 15 |
| Upstream VS Code extensions | 139 |

The scan excludes vendored/generated trees such as `node_modules/`, `.build/`, `out/`, `out-build/` and `.vscode-test/`.

## Primary Manifests

| Path | Ecosystem | Role | Package | Direct deps |
| --- | --- | --- | --- | --- |
| `package.json` | npm | Product root | `code-oss-dev@1.110.0` | 48 runtime / 102 dev / 1 optional |
| `build/package.json` | npm | Build toolchain | `code-oss-dev-build@1.0.0` | 62 dev / 1 optional |
| `remote/web/package.json` | npm | Web runtime | `vscode-web@0.0.0` | 20 runtime |
| `extensions/latex-workshop/package.json` | npm | Embedded LaTeX extension | `latex-workshop@10.12.2` | 11 runtime / 29 dev |
| `packages/co-doc-core/package.json` | npm | CO shared package | `co-doc-core@0.0.1` | 1 dev |
| `packages/co-preview-core/package.json` | npm | CO shared package | `co-preview-core@0.0.1` | 1 dev |
| `packages/co-storage-core/package.json` | npm | CO shared package | `co-storage-core@0.0.1` | 1 dev |
| `packages/co-template-core/package.json` | npm | CO shared package | `co-template-core@0.0.1` | 1 dev |
| `extensions/co-diagramador/package.json` | npm | CO extension | `co-diagramador@0.0.1` | 6 runtime / 3 dev |
| `extensions/co-data-set/package.json` | npm | CO extension | `co-data-set@0.0.1` | 3 runtime / 1 dev |
| `extensions/co-correcao/package.json` | npm | CO extension | `co-correcao@0.0.1` | 4 runtime / 1 dev |
| `extensions/co-shell/package.json` | npm | CO extension | `co-shell@0.0.1` | 1 dev |
| `extensions/co-template-generator/package.json` | npm | CO extension | `co-template-generator@0.0.1` | 1 dev |
| `test/automation/package.json` | npm | UI automation harness | `vscode-automation@1.71.0` | 5 runtime / 6 dev |
| `test/smoke/package.json` | npm | Smoke test harness | `code-oss-dev-smoke-test@0.1.0` | 2 runtime / 4 dev |
| `test/sanity/package.json` | npm | Sanity test harness | `code-oss-dev-sanity-test@0.1.0` | 5 runtime / 4 dev |
| `test/mcp/package.json` | npm | MCP test harness | `code-oss-dev-mcp@0.1.0` | 4 runtime / 4 dev |
| `cli/Cargo.toml` | cargo | Rust CLI | `code-cli@0.1.0` | 42 runtime / 2 build / 4 target-specific / 3 patched crates |
| `build/win32/Cargo.toml` | cargo | Windows updater helper | `inno_updater@0.18.2` | 6 runtime |

## Direct Dependency Inventory

### Product Root

- Runtime direct deps (48 total): `@parcel/watcher@^2.5.6`, `@vscode/sqlite3@5.1.12-vscode`, `@vscode/spdlog@^0.15.7`, `@xterm/addon-webgl@^0.20.0-beta.143`, `@xterm/xterm@^6.1.0-beta.144`, `katex@^0.16.22`, `kerberos@2.1.1`, `native-keymap@^3.3.5`, `node-pty@^1.2.0-beta.10`, `open@^10.1.2`, `tas-client@0.3.1`, `undici@^7.18.2`, `vscode-oniguruma@1.7.0`, `vscode-textmate@^9.3.2`
- Dev/build direct deps (102 total): `@playwright/test@^1.56.1`, `@typescript/native-preview@^7.0.0-dev.20260130`, `@vscode/test-electron@^2.4.0`, `electron@39.3.0`, `eslint@^9.36.0`, `event-stream@3.3.4`, `glob@^5.0.13`, `gulp@^4.0.0`, `husky@^0.13.1`, `mocha@^10.8.2`, `rimraf@^2.2.8`, `source-map@0.6.1`, `source-map-support@^0.3.2`, `tsec@0.2.7`, `typescript@^6.0.0-dev.20260130`, `webpack@^5.94.0`
- Optional deps (1 total): `windows-foreground-love@0.6.1`

### Build and Runtime Side Graphs

- `build/package.json` highlights: `@azure/cosmos@^3`, `@azure/identity@^4.2.1`, `@azure/storage-blob@^12.25.0`, `@vscode/vsce@3.6.1`, `dmg-builder@^26.5.0`, `esbuild@0.27.2`, `tree-sitter@^0.22.4`, `vscode-universal-bundler@^0.1.3`, `zx@^8.8.5`
- `remote/web/package.json` runtime deps (20 total): `@microsoft/1ds-core-js@^3.2.13`, `@microsoft/1ds-post-js@^3.2.13`, `@vscode/codicons@^0.0.45-5`, `@vscode/iconv-lite-umd@0.7.1`, `@vscode/tree-sitter-wasm@^0.3.0`, `@vscode/vscode-languagedetection@1.0.21`, `@xterm/addon-clipboard@^0.3.0-beta.144`, `@xterm/addon-image@^0.10.0-beta.144`, `@xterm/addon-ligatures@^0.11.0-beta.144`, `@xterm/addon-progress@^0.3.0-beta.144`, `@xterm/addon-search@^0.17.0-beta.144`, `@xterm/addon-serialize@^0.15.0-beta.144`, `@xterm/addon-unicode11@^0.10.0-beta.144`, `@xterm/addon-webgl@^0.20.0-beta.143`, `@xterm/xterm@^6.1.0-beta.144`, `jschardet@3.1.4`, `katex@^0.16.22`, `tas-client@0.3.1`, `vscode-oniguruma@1.7.0`, `vscode-textmate@^9.3.2`
- `extensions/latex-workshop/package.json` runtime deps (11 total): `cross-spawn@^7.0.6`, `glob@^11.1.0`, `iconv-lite@^0.6.3`, `latex-utensils@^6.2.0`, `mathjax-full@^3.2.2`, `micromatch@^4.0.8`, `pdfjs-dist@5.4.394`, `tmp@^0.2.4`, `vsls@^1.0.4753`, `workerpool@^9.2.0`, `ws@^8.18.0`
- `extensions/latex-workshop/package.json` dev deps (29 total): `@types/node@^20.17.11`, `@types/vscode@^1.96.0`, `@vscode/test-electron@^2.4.1`, `@vscode/vsce@^3.7.1`, `c8@^10.1.3`, `eslint@^9.17.0`, `mocha@^11.0.1`, `typescript@^5.7.2`

### CO Modules

| Path | Package | Direct deps |
| --- | --- | --- |
| `packages/co-doc-core/package.json` | co-doc-core | 1 dev |
| `packages/co-preview-core/package.json` | co-preview-core | 1 dev |
| `packages/co-storage-core/package.json` | co-storage-core | 1 dev |
| `packages/co-template-core/package.json` | co-template-core | 1 dev |
| `extensions/co-diagramador/package.json` | co-diagramador | 6 runtime / 3 dev |
| `extensions/co-data-set/package.json` | co-data-set | 3 runtime / 1 dev |
| `extensions/co-correcao/package.json` | co-correcao | 4 runtime / 1 dev |
| `extensions/co-shell/package.json` | co-shell | 1 dev |
| `extensions/co-template-generator/package.json` | co-template-generator | 1 dev |

- `extensions/co-diagramador/package.json` runtime deps: `co-doc-core@file:../../packages/co-doc-core`, `co-preview-core@file:../../packages/co-preview-core`, `co-storage-core@file:../../packages/co-storage-core`, `co-template-core@file:../../packages/co-template-core`, `yauzl@^3.0.0`, `yazl@^2.5.1`
- `extensions/co-data-set/package.json` runtime deps: `co-doc-core@file:../../packages/co-doc-core`, `co-storage-core@file:../../packages/co-storage-core`, `co-template-core@file:../../packages/co-template-core`
- `extensions/co-correcao/package.json` runtime deps: `co-doc-core@file:../../packages/co-doc-core`, `co-preview-core@file:../../packages/co-preview-core`, `co-storage-core@file:../../packages/co-storage-core`, `co-template-core@file:../../packages/co-template-core`
- `extensions/co-shell/package.json` and `extensions/co-template-generator/package.json` have no third-party runtime deps.

### Test Harnesses

- Test/runtime highlights: `mocha@^11.7.5`, `node-fetch@^3.3.2`, `playwright@^1.57.0`, `@modelcontextprotocol/sdk@1.25.2`, `node-fetch@^2.6.7`, `npm-run-all2@^8.0.4`, `axe-core@^4.10.2`, `npm-run-all2@^8.0.4`, `tmp@0.2.4`, `tree-kill@1.2.2`
- `test/smoke/package.json` runtime deps: `ncp@^2.0.0`, `node-fetch@^2.6.7`

### Rust Components

- `cli/Cargo.toml` runtime crates (42 total): `async-trait`, `base64`, `bytes`, `cfg-if`, `chrono`, `clap`, `clap_lex`, `console`, `const_format`, `dialoguer`, `dirs`, `flate2`, `futures`, `gethostname`, `hyper`, `indicatif`, `keyring`, `lazy_static`, `libc`, `log`, `open`, `opentelemetry`, `pin-project`, `rand`, `regex`, `reqwest`, `rmp-serde`, `serde`, `serde_bytes`, `serde_json`, `sha2`, `shell-escape`, `sysinfo`, `tar`, `tempfile`, `thiserror`, `tokio`, `tokio-util`, `tunnels`, `url`, `uuid`, `zip`
- `cli/Cargo.toml` build crates (2 total): `serde`, `serde_json`
- `cli/Cargo.toml` target-specific crates (4 total): `core-foundation`, `winapi`, `winreg`, `zbus`
- `cli/Cargo.toml` patched/git crates (3 total): `russh`, `russh-cryptovec`, `russh-keys`
- `build/win32/Cargo.toml` crates (6 total): `byteorder`, `crc`, `slog`, `slog-async`, `slog-term`, `tempfile`

## SBOM Targets

The repository can generate CycloneDX without extra tooling because npm 10.9.4 already ships `npm sbom`.

| Target | Output | Component | Components | Dependency edges |
| --- | --- | --- | --- | --- |
| Repo root | `docs/dependency-root.cyclonedx.json` | `CO` | 1528 | 1529 |
| Build toolchain | `docs/dependency-build.cyclonedx.json` | `build` | 809 | 810 |
| Remote web | `docs/dependency-remote-web.cyclonedx.json` | `web` | 29 | 30 |
| LaTeX Workshop | `docs/dependency-latex-workshop.cyclonedx.json` | `latex-workshop` | 668 | 669 |

Current SBOM coverage is intentionally focused on the largest npm lockfile islands that affect product/runtime/build behavior:

- repo root
- `build/`
- `remote/web/`
- `extensions/latex-workshop/`

Rust manifests are inventoried here but do not yet have a built-in SBOM generator wired into the repository.

## Initial Supply-Chain Priorities

1. Git-sourced Rust crates in `cli/Cargo.toml`: `tunnels` is pinned to a Git revision, and `russh`, `russh-cryptovec`, `russh-keys` are patched from a Git branch. These are reproducibility and provenance hotspots.
2. Native/prebuilt dependencies in the root graph: `@parcel/watcher@^2.5.6`, `@vscode/sqlite3@5.1.12-vscode`, `@vscode/spdlog@^0.15.7`, `kerberos@2.1.1`, `native-keymap@^3.3.5`, `node-pty@^1.2.0-beta.10`. These deserve priority in vulnerability review because they mix native code, ABI sensitivity and platform-specific packaging.
3. Prerelease dependency lines in production/build paths: `@xterm/addon-clipboard@^0.3.0-beta.144`, `@xterm/addon-image@^0.10.0-beta.144`, `@xterm/addon-ligatures@^0.11.0-beta.144`, `@xterm/addon-progress@^0.3.0-beta.144`, `@xterm/addon-search@^0.17.0-beta.144`, `@xterm/addon-serialize@^0.15.0-beta.144`, `@xterm/addon-unicode11@^0.10.0-beta.144`, `@xterm/addon-webgl@^0.20.0-beta.143`, `@xterm/headless@^6.1.0-beta.144`, `@xterm/xterm@^6.1.0-beta.144`, `node-pty@^1.2.0-beta.10`, plus `@typescript/native-preview@^7.0.0-dev.20260130` and `typescript@^6.0.0-dev.20260130` on the TypeScript toolchain side.
4. Older legacy packages still present in the root build graph: `event-stream@3.3.4`, `glob@^5.0.13`, `husky@^0.13.1`, `mime@^1.4.1`, `rimraf@^2.2.8`, `source-map@0.6.1`, `source-map-support@^0.3.2`. They are not being upgraded here, but they should be first in line for future review.
5. Separate lockfile islands mean a single root scan is insufficient. At minimum, vulnerability scanning must cover `package-lock.json`, `build/package-lock.json`, `remote/web/package-lock.json`, `extensions/latex-workshop/package-lock.json`, the CO extension/package lockfiles, and the test harness lockfiles.
