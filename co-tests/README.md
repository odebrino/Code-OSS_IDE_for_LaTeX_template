# CO Tests Hub

Test hub com foco em baixa flakiness para as partes CO.

## Pre-requisitos

- Node.js 22.x
- Dependencias instaladas (`npm install`)

## Comandos

```bash
npm run co:test
npm run co:test:unit
npm run co:test:ext
```

## Escopo

- Unit tests (Node/Mocha):
  - `packages/co-template-core`
  - `extensions/co-diagramador`
  - `extensions/co-shell` (helpers puros)
- Integration leve em host de extensao (sem UI):
  - `extensions/co-shell`
  - `extensions/co-template-generator`

Todos os runs exportam `TECTONIC_PATH=__missing__` para evitar dependencia de TeX instalado.

## Debug de falhas

- Rode uma etapa por vez:
  - `bash co-tests/scripts/run-unit.sh`
  - `bash co-tests/scripts/run-ext.sh`
- Integration de uma extensao:
  - `npx mocha "extensions/co-shell/out/test/integration/**/*.test.js" --ui tdd`
  - `npx mocha "extensions/co-template-generator/out/test/integration/**/*.test.js" --ui tdd`

## Rodar suite especifica (Mocha)

Exemplos:

```bash
npx mocha "packages/co-template-core/out/test/**/*.test.js" --grep "buildPreview"
npx mocha "extensions/co-shell/out/test/unit/**/*.test.js" --grep "admins"
```
