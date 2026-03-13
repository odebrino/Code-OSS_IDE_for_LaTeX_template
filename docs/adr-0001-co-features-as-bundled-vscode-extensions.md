# ADR 0001: CO Features As Bundled VS Code Extensions

- Status: accepted
- Date: 2026-03-12

## Context

The repository is a Code-OSS fork. CO-specific functionality lives in `extensions/co-*`, and those extensions depend on shared local packages in `packages/co-*` through `file:` dependencies. The extension manifests declare `main`, `activationEvents`, `commands`, `views`, and configuration keys in the standard VS Code extension model.

## Decision

Keep CO end-user features in the VS Code extension host, with shared domain logic extracted into `packages/co-*`.

## Consequences

- UI is exposed through commands, activity bar views, and webviews, not through a separate application shell.
- Shared logic stays reusable across `co-diagramador`, `co-correcao`, and `co-data-set`.
- Filesystem paths, `globalStorageUri`, extension configuration, and spawned local tools remain the main integration boundaries.
- `latex-workshop` stays a separate embedded extension with its own lifecycle.

## Evidence

- `extensions/co-diagramador/package.json`
- `extensions/co-correcao/package.json`
- `extensions/co-data-set/package.json`
- `extensions/co-shell/package.json`
- `packages/co-doc-core/package.json`
- `packages/co-storage-core/package.json`
- `packages/co-template-core/package.json`
- `packages/co-preview-core/package.json`
