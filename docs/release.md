# Release Baseline

This repository currently has two release surfaces:

- GitHub Actions in [`.github/workflows/build.yml`](../.github/workflows/build.yml) produces unsigned build artifacts for `main`.
- Azure Pipelines under [`build/azure-pipelines/`](../build/azure-pipelines/) remains the heavier signing and publish path.

This fork only hardens the first surface. It does not replace the Azure release flow.

## Local Artifact Build

Recommended baseline before producing a local artifact:

```bash
npm ci
npm run co:check
npm run co:release:build -- --target vscode-linux-x64
```

Replace `vscode-linux-x64` with the existing gulp target you need, for example:

- `vscode-win32-x64`
- `vscode-darwin-arm64`

Outputs:

- product directory: `../VSCode-<platform>-<arch>`
- release bundle: `.build/release/<artifact-name>.tar.gz`
- bundle checksum: `.build/release/<artifact-name>.tar.gz.sha256`
- traceability manifest: `.build/release/<artifact-name>.json`

## Naming And Traceability

The release manifest records:

- `package.json` version
- `package.json.distro`
- source commit and branch
- whether the local worktree was dirty
- target name and output directory
- bundle archive path and SHA-256 checksum

GitHub Actions uploads artifacts using the same naming convention:

`<package-name>-<version>-<target>-<short-commit>[-dirty]`

This keeps unsigned artifacts tied to a concrete source revision without changing the existing package format.

## CI Build Artifacts

The GitHub workflow now:

1. installs with `npm ci`
2. fetches built-in VSIX dependencies
3. runs `npm run gulp <target>`
4. packages the build output into a `tar.gz` bundle
5. generates checksum and release manifest sidecars
6. emits a GitHub build provenance attestation for the bundle when the repository supports it
7. uploads the bundle plus its sidecars as one workflow artifact

This is the minimum viable provenance layer for the current fork: one immutable bundle per target, one checksum, one manifest, and one CI attestation. It improves traceability without replacing the heavier Azure signing path.

## Provenance

GitHub Actions attests the `tar.gz` bundle in [`.github/workflows/build.yml`](../.github/workflows/build.yml) using `actions/attest-build-provenance`.

The attestation step runs automatically for public repositories. For private repositories, keep it off by default unless the host environment is known to support GitHub artifact attestations, then set the repository variable:

- `ENABLE_PRIVATE_ARTIFACT_ATTESTATION=true`

Local verification remains simple even without GitHub attestation:

```bash
(cd .build/release && sha256sum -c <artifact-name>.tar.gz.sha256)
```

For GitHub-hosted attestations, verify against the repository that produced the bundle:

```bash
gh attestation verify .build/release/<artifact-name>.tar.gz --repo OWNER/REPO
```

## Rollback

There is no automated rollback in this repository.

Logical rollback is:

1. identify the last known-good commit or workflow artifact
2. verify the bundle checksum and, when present, the GitHub attestation
3. rebuild that same target from the same commit, or reuse the stored bundle artifact
4. if a signed/public release is involved, rerun or re-promote the corresponding Azure pipeline build

## Still Manual

- signing
- ESRP / Azure publish
- release promotion
- external distribution
- attestation for Azure-produced final signed assets

Those steps already exist in Azure Pipelines and still depend on external credentials and infrastructure.
