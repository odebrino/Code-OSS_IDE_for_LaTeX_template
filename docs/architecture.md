# Architecture Overview

This document records the current architecture that is visible in the repository. It is descriptive, not aspirational.

## Current Topology

```mermaid
flowchart TD
    User[User and workspace]

    subgraph Product["CO product shell"]
        Core[Code-OSS core\nsrc/ + Electron workbench]
        EH[VS Code extension host]
        Remote[remote/web runtime]
        CLI[CLI launcher and tunnels\ncli/ (Rust)]
    end

    subgraph CO["Bundled CO layer"]
        Diagramador[co-diagramador]
        Correcao[co-correcao]
        DataSet[co-data-set]
        Shell[co-shell]
        Generator[co-template-generator]
        LatexWorkshop[latex-workshop]
    end

    subgraph Shared["Shared CO packages"]
        DocCore[co-doc-core]
        StorageCore[co-storage-core]
        TemplateCore[co-template-core]
        PreviewCore[co-preview-core]
    end

    subgraph State["Local state and files"]
        WorkspaceFiles[Workspace files\nproject.json, tarefas/, templates/]
        GlobalStorage[globalStorageUri\nVS Code extension storage]
        RuntimeDirs[CO runtime dirs\n.co/, ~/CO-runtime]
        LocalConfig[co-secret/config/*.json]
    end

    subgraph External["External tools and services"]
        Tectonic[tectonic]
        Latexmk[latexmk / pdflatex]
        PdfToPpm[pdftoppm]
        Galleries[Open VSX and built-in VSIX fetch]
        ReleaseInfra[GitHub Actions and Azure pipelines]
    end

    User --> Core
    Core --> EH
    Core --> Remote
    Core --> CLI
    Core --> Galleries

    EH --> Diagramador
    EH --> Correcao
    EH --> DataSet
    EH --> Shell
    EH --> Generator
    EH --> LatexWorkshop

    Diagramador --> DocCore
    Diagramador --> StorageCore
    Diagramador --> TemplateCore
    Diagramador --> PreviewCore

    Correcao --> DocCore
    Correcao --> StorageCore
    Correcao --> TemplateCore
    Correcao --> PreviewCore

    DataSet --> DocCore
    DataSet --> StorageCore
    DataSet --> TemplateCore

    Shell --> GlobalStorage
    Shell --> LocalConfig
    Shell --> Latexmk

    Generator --> TemplateCore

    DocCore --> WorkspaceFiles
    StorageCore --> GlobalStorage
    StorageCore --> RuntimeDirs
    TemplateCore --> WorkspaceFiles
    TemplateCore --> RuntimeDirs
    TemplateCore --> Tectonic
    PreviewCore --> RuntimeDirs
    PreviewCore --> PdfToPpm

    Diagramador --> WorkspaceFiles
    Diagramador --> GlobalStorage
    Diagramador --> RuntimeDirs
    Correcao --> WorkspaceFiles
    Correcao --> GlobalStorage
    Correcao --> RuntimeDirs
    DataSet --> WorkspaceFiles
    DataSet --> GlobalStorage

    ReleaseInfra --> Core
    ReleaseInfra --> CLI
```

## Modules and Boundaries

- `src/`, `remote/`, and `cli/` are the upstream product shell layers: Electron desktop, web/remote runtime, and Rust CLI.
- `extensions/co-*` contains the CO-specific end-user features. These are regular VS Code extensions with `main`, `activationEvents`, `commands`, `views`, and webviews declared in `package.json`.
- `packages/co-*` contains shared CO logic with no VS Code contribution points of their own:
  - `co-doc-core`: project payload parsing, normalization, and migration
  - `co-storage-core`: runtime/persistent path resolution and filesystem helpers
  - `co-template-core`: template scanning, validation, storage, and LaTeX build orchestration
  - `co-preview-core`: PDF preview selection and rendering helpers
- `extensions/latex-workshop` is an embedded upstream extension with its own lifecycle and test/build surface. It is adjacent to the CO extensions, not merged into the CO shared packages.

## Data Flow

1. A command or activity bar view activates a CO extension in the extension host.
2. The extension loads or derives state from workspace files, `context.globalStorageUri`, and optional local config under `co-secret/`.
3. The extension delegates shared work to `packages/co-*`:
   - document parsing and migration through `co-doc-core`
   - path resolution and atomic storage through `co-storage-core`
   - template discovery and LaTeX compilation through `co-template-core`
   - preview rendering through `co-preview-core`
4. External tools are invoked when needed:
   - `tectonic` for Diagramador and Correcao builds
   - `latexmk` with `pdflatex` fallback in `co-shell`
   - `pdftoppm` when preview falls back to image rendering
5. The extension posts state back to webviews and persists derived artifacts such as JSON payloads, PDFs, logs, and template files.

## External Dependencies

- Local runtime/toolchain:
  - Node/Electron for the product shell
  - TeX distribution for LaTeX features
  - `pdftoppm` for image preview fallback
- Product and extension distribution:
  - Open VSX is the configured extension gallery in `product.json`
  - built-in VSIX are fetched during full product builds
- Automation:
  - GitHub Actions runs the CO-focused CI baseline
  - Azure pipelines still hold the heavier upstream compile/sign/publish flow

## Extension Points

- VS Code contribution points in `extensions/co-*/package.json` are the main integration boundary:
  - commands
  - activity bar containers and views
  - webviews and webview view providers
  - workspace/user configuration keys
- Shared CO packages are imported through local `file:` dependencies, which keeps reuse explicit and local to this repository.
- Local operator configuration is intentionally file-based:
  - `coShell.adminsFile`
  - `co.runtime.baseDir`
  - `co.tectonic.bundlePath`
  - `co-secret/config/*.json`

## Related ADRs

- [ADR 0001: CO Features As Bundled VS Code Extensions](./adr-0001-co-features-as-bundled-vscode-extensions.md)
- [ADR 0002: npm Lockfile Vulnerability Gate](./adr-0002-npm-lockfile-vulnerability-gate.md)
