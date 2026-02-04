# CO

This is a CO-branded fork of Code-OSS with LaTeX Workshop embedded.

## Requirements
- Node 22.x (see `.nvmrc`)
- Python 3
- C/C++ build tools
  - Linux: `build-essential`, `pkg-config`, `libx11-dev`, `libxkbfile-dev`, `libsecret-1-dev` (plus common VS Code deps)
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
- TeX distribution for LaTeX Workshop (TeX Live or TinyTeX)

## Install

```
npm install
```

## Build (local)

```
npm run fetch-builtin-vsix
npm run gulp vscode-<platform>-<arch>
```

Examples:
- Linux x64: `npm run gulp vscode-linux-x64`
- Windows x64: `npm run gulp vscode-win32-x64`
- macOS arm64: `npm run gulp vscode-darwin-arm64`

Artifacts are created in `../VSCode-<platform>-<arch>`.

Notes:
- ARM builds on CI are marked optional because they can require extra setup on GitHub runners.
- LaTeX Workshop requires a working TeX toolchain in PATH to compile documents.
- If the VSIX fetch hits GitHub rate limits, set `GITHUB_TOKEN` and rerun.
