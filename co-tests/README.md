# CO Tests Hub

Test hub com foco em baixa flakiness para as partes CO.

## Pre-requisitos

- Node.js 22.x (`.nvmrc`)
- Dependencias instaladas

Use `npm ci` em CI ou quando quiser ambiente limpo/reprodutivel. Use `npm install` para desenvolvimento local iterativo.

## Comandos

```bash
npm run co:test
npm run co:test:unit
npm run co:test:ext
```

`npm run co:test` executa unit + integration e falha com exit code != 0 se qualquer etapa falhar.

## Escopo

- Unit tests (Node/Mocha):
  - `packages/co-template-core`
  - `extensions/co-diagramador`
  - `extensions/co-shell` (helpers puros)
- Integration leve headless (sem UI/webview):
  - `extensions/co-shell`
  - `extensions/co-template-generator`

Todos os runs exportam `TECTONIC_PATH=__missing__` para evitar dependencia de TeX instalado.

## Debug de falhas

- Rodar etapas separadas:
  - `bash co-tests/scripts/run-unit.sh`
  - `bash co-tests/scripts/run-ext.sh`
- Rodar suites especificas:
  - `npx mocha "packages/co-template-core/out/test/**/*.test.js" --ui tdd --grep "buildPreview"`
  - `npx mocha "extensions/co-shell/out/test/unit/**/*.test.js" --ui tdd --grep "admins"`
  - `npx mocha "extensions/co-template-generator/out/test/integration/**/*.test.js" --ui tdd`

## Hook local opcional

```bash
cp scripts/hooks/pre-commit.example .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

O exemplo roda `npm run co:test:unit` antes de permitir commit local.
