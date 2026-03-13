# CO Tests Hub

Test hub com foco em baixa flakiness para as partes CO.

## Pre-requisitos

- Node.js 22.x (`.nvmrc`)
- Dependencias instaladas

Use `npm ci` em CI ou quando quiser ambiente limpo/reprodutivel. Use `npm install` para desenvolvimento local iterativo.

## Comandos

```bash
npm test
npm run co:test
npm run co:test:unit
npm run co:test:ext
npm run co:test:smoke
```

`npm test` e `npm run co:test` executam unit + integration e falham com exit code != 0 se qualquer etapa falhar.
`npm run co:test:smoke` roda so a jornada principal de usuario em `co-diagramador` e `co-correcao`, usando as suites de extensao ja existentes com filtro por nome.

## Escopo

- Unit tests (Node/Mocha):
  - `packages/co-doc-core`
  - `packages/co-storage-core`
  - `packages/co-template-core`
  - `packages/co-preview-core`
  - `extensions/co-diagramador`
  - `extensions/co-data-set`
  - `extensions/co-correcao`
  - `extensions/co-shell` (helpers puros)
- Integration leve headless (sem UI/webview):
  - `extensions/co-diagramador`
  - `extensions/co-data-set`
  - `extensions/co-correcao`
  - `extensions/co-shell`
  - `extensions/co-template-generator`

Todos os runs exportam `TECTONIC_PATH=__missing__` para evitar dependencia de TeX instalado.

## Debug de falhas

- Rodar etapas separadas:
  - `bash co-tests/scripts/run-unit.sh`
  - `bash co-tests/scripts/run-ext.sh`
  - `bash co-tests/scripts/run-smoke.sh`
- Rodar suites especificas:
  - `npx mocha "packages/co-template-core/out/test/**/*.test.js" --ui tdd --grep "buildPreview"`
  - `npx mocha "extensions/co-shell/out/test/unit/**/*.test.js" --ui tdd --grep "admins"`
  - `npx mocha "extensions/co-template-generator/out/test/integration/**/*.test.js" --ui tdd`
  - `MOCHA_FGREP='[smoke]' node co-tests/vscode-runner/runExtensionsTests.mjs co-diagramador`

## Hook local opcional

```bash
cp scripts/hooks/pre-commit.example .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

O exemplo roda `npm run co:test:unit` antes de permitir commit local.
