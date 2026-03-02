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
bash scripts/check-secrets.sh
```

Optional hook setup:

```bash
mkdir -p .git/hooks
cp scripts/hooks/pre-commit.example .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```
