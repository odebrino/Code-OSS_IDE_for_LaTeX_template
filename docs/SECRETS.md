# Secrets and Local-Only Data

This repository keeps source code and project structure in Git, but local sensitive data must stay outside version control.

## Local Secret Directory

Use `co-secret/` at the repository root for local-only data.

- `co-secret/config/`
- `co-secret/notes/`

`co-secret/` is ignored by Git via `.gitignore`.

## Files to Create Locally

Create these files in `co-secret/config/` when needed:

- `admins.json`
- `admin-settings.json`

Templates are versioned in `extensions/co-shell/config/`:

- `admins.template.json`
- `admin-settings.template.json`

## Setup

From repository root:

```bash
mkdir -p co-secret/config
cp extensions/co-shell/config/admins.template.json co-secret/config/admins.json
cp extensions/co-shell/config/admin-settings.template.json co-secret/config/admin-settings.json
```

Then edit the copied files with your local values.

## Runtime Fallback

`co-shell` loads admin config in this order:

1. `coShell.adminsFile` (if configured and exists)
2. `co-secret/config/admins.json`
3. `extensions/co-shell/config/admins.template.json`
4. empty admin set

So the extension still runs without `co-secret/`.

## Secret Leak Check

Run:

```bash
npm run co:secrets
```

Optional hook setup:

```bash
mkdir -p .git/hooks
cp scripts/hooks/pre-commit.example.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The example hook runs the local secret scan first and then `npm run co:test:unit`.

## Environment Variables

The CO surfaces use a small set of environment variables. Keep real values local and out of Git.

### Optional local/runtime variables

- `TECTONIC_PATH`: explicit path to the `tectonic` executable.
- `CO_TECTONIC_BUNDLE`: explicit path to a local Tectonic bundle.
- `CO_RUNTIME_BASE_DIR`: overrides the visible runtime base directory used by CO modules.
- `CO_SAVE_DIR`: overrides the persistent base directory used by Diagramador/Correcao/Data Set.
- `VSCODE_SKIP_PRELAUNCH`: skips the prelaunch bootstrap in local dev scripts.

### Optional fetch/build variables

- `GITHUB_TOKEN`
- `GH_TOKEN`
- `GITHUB_PAT`

These are only needed when GitHub rate limits affect VSIX or build-related downloads.

### Test-only variables

- `CO_TESTING`
- `CO_TEST_WORKSPACE`

These are set by the repository test harness and should not be committed into local config files.

## Local Config Files

- Keep real values in `co-secret/` or in untracked `.env*` files when you need local shell helpers.
- Do not commit populated admin lists, personal emails, tokens, or copied local overrides.
