# CO

This is a CO-branded fork of Code-OSS with LaTeX Workshop embedded.

## CO Layout
- `packages/co-doc-core`: Shared CO project format and migration helpers.
- `packages/co-storage-core`: Shared storage/path/runtime resolution helpers.
- `packages/co-preview-core`: Shared PDF preview helpers and PDF.js discovery.
- `packages/co-template-core`: Shared template contract, validation, renderer, and build service.
- `extensions/co-correcao`: Correcao (revisoes e sugestoes com preview PDF).
- `extensions/co-shell`: CO Shell (roles, admin/student home).
- `extensions/co-diagramador`: Diagramador UI, preview pipeline, e aba de Templates.
- `extensions/co-data-set`: Data Set (indexador de projetos/templates/pdfs).
- `extensions/co-template-generator`: Template generator hooks used by CO tests/integration.
- `extensions/latex-workshop`: Embedded LaTeX authoring and preview extension.

## Architecture Docs

- [Architecture overview](./docs/architecture.md)
- [Technical backlog](./docs/technical-backlog.md)
- [Release baseline](./docs/release.md)
- [Threat model](./docs/threat-model.md)
- [ADR 0001: CO features as bundled VS Code extensions](./docs/adr-0001-co-features-as-bundled-vscode-extensions.md)
- [ADR 0002: npm lockfile vulnerability gate](./docs/adr-0002-npm-lockfile-vulnerability-gate.md)

## Requirements
- Node 22.x (see `.nvmrc`)
- Python 3
- C/C++ build tools
  - Linux: `build-essential`, `pkg-config`, `libx11-dev`, `libxkbfile-dev`, `libsecret-1-dev` (plus common VS Code deps)
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
- TeX distribution for real PDF generation in CO features and LaTeX Workshop (TeX Live or TinyTeX)

## Install

For a clean and reproducible local setup:

```bash
npm ci
```

For iterative local development, `npm install` also works, but CI and the repository workflows use `npm ci`.

## Run Locally

Base desktop app in development mode:

```bash
./scripts/code.sh
```

Windows:

```bat
scripts\code.bat
```

CO extension development loop:

Terminal 1:

```bash
npm run co:watch
```

Terminal 2, choose the extension under development:

```bash
./scripts/code.sh --extensionDevelopmentPath=extensions/co-diagramador
./scripts/code.sh --extensionDevelopmentPath=extensions/co-data-set
./scripts/code.sh --extensionDevelopmentPath=extensions/co-correcao
./scripts/code.sh --extensionDevelopmentPath=extensions/co-shell
./scripts/code.sh --extensionDevelopmentPath=extensions/co-template-generator
```

If you need the full upstream watch pipeline instead of only CO modules:

```bash
npm run watch
```

## Test

```bash
npm run co:test:unit
npm run co:test:smoke
npm run co:test:ext
npm run co:test
```

Notes:
- `co:test:*` exports `TECTONIC_PATH=__missing__`, so TeX is not required just to run the CO test suites.
- `co:test:smoke` is the smallest end-to-end validation of the main user journey: create/open a task in `co-diagramador` and load the same task for preview in `co-correcao`.
- Upstream Code-OSS test entrypoints still exist under `scripts/test*.sh`, but the commands above are the smallest CO-focused baseline.

## Quality

```bash
npm run co:deps:inventory
npm run co:deps:audit
npm run co:secrets
npm run co:format:check
npm run co:lint
npm run co:typecheck
npm run co:check
```

Notes:
- `co:deps:inventory` refreshes [docs/dependency-inventory.md](./docs/dependency-inventory.md) and regenerates ignored CycloneDX SBOM files under `docs/*.cyclonedx.json`.
- `co:deps:audit` runs `npm audit --package-lock-only` across the main npm lockfile islands, updates [docs/vulnerability-backlog.md](./docs/vulnerability-backlog.md), and only fails on runtime `high`/`critical` findings.
- `co:secrets` runs the repository's CO-focused secret scan before code reaches CI.
- `co:format:check` reuses the existing repository hygiene checker, scoped to CO sources and the small build glue touched by this fork.
- `co:typecheck` uses CO compilation as the TypeScript validation for CO modules and `build/package.json` typecheck for local build scripts.

## Diagnostics

- `co-diagramador` writes operational traces to the `CO Diagramador` output channel.
- `co-correcao` writes operational traces to the `CO Correcao` output channel.
- The shared LaTeX build path now logs `component`, `scope`, `buildId`, `templateId`, `documentId`, `durationMs`, `cacheHit`, and `failureCode` when available.
- Output channels stay compact on failure; the full raw compiler output remains in the per-build `build.log`.

## CI

The repository already ships a CO-focused GitHub Actions workflow at [`.github/workflows/co-tests.yml`](./.github/workflows/co-tests.yml).

It runs on pull requests targeting `main`, pushes to `main`, and manual dispatches with this baseline:

```bash
npm ci
npm run co:deps:audit
npm run co:format:check
npm run co:lint
npm run co:build
npm --prefix build run typecheck
npm run co:test:smoke
npm test
```

Notes:
- `actions/setup-node` caches the npm dependency store.
- `.vscode-test` is cached to reduce repeated VS Code downloads for extension integration tests.
- `co:test:smoke` runs earlier in PRs to fail fast on the core Diagramador/Correcao journey before the broader CO suite.
- On Linux CI, the workflow uses `xvfb-run` when available so the Electron-based extension tests can run headlessly.

## Build

Fast local CO-only build:

```bash
npm run co:build
```

Full local product build:

```bash
npm run fetch-builtin-vsix
npm run gulp vscode-<platform>-<arch>
```

Examples:
- Linux x64: `npm run gulp vscode-linux-x64`
- Windows x64: `npm run gulp vscode-win32-x64`
- macOS arm64: `npm run gulp vscode-darwin-arm64`

Artifacts are created in `../VSCode-<platform>-<arch>`.

## Release

Unsigned build artifacts can be produced locally with traceability metadata:

```bash
npm run co:check
npm run co:release:build -- --target vscode-linux-x64
```

Outputs:
- `../VSCode-<platform>-<arch>`
- `.build/release/<artifact-name>.tar.gz`
- `.build/release/<artifact-name>.tar.gz.sha256`
- `.build/release/<artifact-name>.json`

Notes:
- The bundle sidecars record version, `distro`, commit, branch, dirty worktree state, target, and bundle SHA-256.
- GitHub Actions in [`.github/workflows/build.yml`](./.github/workflows/build.yml) uploads the bundle plus checksum/manifest and emits a GitHub provenance attestation when supported.
- Signed publishing is still handled by the existing Azure pipeline flow under [`build/azure-pipelines/`](./build/azure-pipelines/).
- See [docs/release.md](./docs/release.md) for the release/rollback baseline.

## Known Issues
- The first `./scripts/code.sh` run performs a prelaunch step and can download/build prerequisites; it is slower than subsequent runs.
- Full product builds are much heavier than `npm run co:build` and require the normal Code-OSS native dependencies for your platform.
- Real PDF generation in `co-diagramador`, `co-correcao`, `co-shell` and LaTeX Workshop requires a working TeX toolchain in PATH.
- If PDF image fallback is needed, `pdftoppm` may also be required by `co-preview-core`.
- If the VSIX fetch hits GitHub rate limits, set `GITHUB_TOKEN` and rerun `npm run fetch-builtin-vsix`.
- `co-shell` admin configuration is local-only; see `docs/SECRETS.md` for `co-secret/config/admins.json` and `admin-settings.json`.
- ARM builds are available, but the repository CI marks some of them optional because they can require extra environment setup.
