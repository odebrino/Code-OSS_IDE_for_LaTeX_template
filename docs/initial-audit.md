# Initial Technical Audit

Audit inicial baseado em manifests, scripts, workflows e modulos representativos do repositório. Isto nao e uma revisao linha a linha de todo o codigo, mas um diagnostico tecnico inicial por evidencia do repo.

## Resumo objetivo

- O repositório e um fork CO-branded de `code-oss` com app desktop Electron, runtime web/remote, CLI em Rust e um conjunto proprio de extensoes/pacotes CO para fluxo LaTeX.
- A stack principal e TypeScript/Node/Electron com build central por Gulp + `tsgo`; o CLI usa Cargo/Rust; o packaging multiplataforma fica em `build/azure-pipelines/`.
- O pacote manager real e `npm` com `package-lock.json` no root e em submodulos. Nao ha `workspaces` npm declarados; os pacotes CO sao ligados via dependencias `file:`.
- A camada CO mora principalmente em `packages/co-*`, `extensions/co-*`, `co-tests/` e usa storage local, webviews de extensao, arquivos JSON e toolchain LaTeX.
- Os maiores riscos iniciais sao: dependencias nativas, multiplos caminhos de persistencia, diversidade de toolchain LaTeX (`tectonic`, `latexmk`, `pdflatex`, `pdftoppm`), acoplamento via filesystem e cobertura de testes desigual entre modulos CO.

## Arquivos consultados

- `package.json`, `.nvmrc`, `.npmrc`, `product.json`, `.gitignore`
- `CO.md`, `docs/SECRETS.md`, `docs/dev-webstorm.md`, `co-tests/README.md`
- `.github/workflows/build.yml`, `.github/workflows/co-tests.yml`, `.github/dependabot.yml`
- `build/gulpfile.ts`, `build/gulpfile.extensions.ts`, `build/gulpfile.cli.ts`, `build/package.json`
- `build/azure-pipelines/product-build.yml`, `build/azure-pipelines/product-publish.yml`, `build/azure-pipelines/product-release.yml`
- `src/main.ts`, `remote/package.json`, `remote/web/package.json`
- `cli/Cargo.toml`, `cli/src/bin/code/main.rs`
- `packages/co-*/package.json`, `packages/co-*/tsconfig.json`, `packages/co-*/src/index.ts`
- `extensions/co-*/package.json`, `extensions/co-*/src/extension.ts`, `extensions/co-*/src/webview.ts`
- `extensions/co-shell/config/*.json`, `extensions/co-diagramador/README.md`
- `extensions/latex-workshop/package.json`, `extensions/latex-workshop/test/README.md`
- `co-tests/scripts/*.sh`, `co-tests/vscode-runner/runExtensionsTests.mjs`

## Stack real

- Linguagens: TypeScript, JavaScript, Rust, Bash, PowerShell, Batch, YAML e JSON. Ha utilitarios pontuais em Python no build, mas nao como runtime principal.
- Runtime principal: Electron + Node.js `22.21.1`.
- Framework de extensao: API de extensoes do VS Code, webviews e extension host.
- Build principal: Gulp (`build/gulpfile*.ts`) + `tsgo`/TypeScript. Para compilacoes localizadas, varias suites usam `tsc -p`.
- Package managers: `npm` e Cargo. O workflow GitHub detecta `pnpm`/`yarn`, mas o repo atual nao tem `pnpm-lock.yaml` nem `yarn.lock`.
- Testes: Mocha, `@vscode/test-electron`, Playwright nos testes upstream, `c8` dentro de `extensions/latex-workshop`.
- Lint/hygiene: ESLint, stylelint, checks de layers/hygiene e script de secret scan.
- Packaging/release: Gulp multiplataforma, product branding em `product.json`, pipelines Azure para compile/sign/publish/release.
- Toolchain LaTeX: `tectonic` para Diagramador/Correcao, `latexmk` com fallback `pdflatex` em `co-shell`, e `latex-workshop` vendorizado para experiencia completa de edicao/preview.

## Entry points identificados

- App desktop: `package.json -> ./out/main.js`, gerado a partir de `src/main.ts`.
- Main Electron/workbench: `src/vs/code/electron-main/main.ts` e `src/vs/workbench/electron-browser/desktop.main.ts`.
- Build root: `build/gulpfile.ts`.
- Build de extensoes/pacotes: `build/gulpfile.extensions.ts`.
- CLI: `cli/src/bin/code/main.rs`.
- Runtime remote/web: `remote/package.json`, `remote/web/package.json`, com build complementar em `build/gulpfile.reh.ts` e `build/gulpfile.vscode.web.ts`.
- Extensoes CO:
  - `extensions/co-diagramador/src/extension.ts`
  - `extensions/co-correcao/src/extension.ts`
  - `extensions/co-data-set/src/extension.ts`
  - `extensions/co-shell/src/extension.ts`
  - `extensions/co-template-generator/src/extension.ts`
- Extensao LaTeX embutida: `extensions/latex-workshop/package.json -> ./out/src/main.js`.
- Runner de testes de extensao CO: `co-tests/vscode-runner/runExtensionsTests.mjs`.

## Mapa estrutural do projeto

- `src/`: nucleo do `code-oss` e workbench.
- `extensions/`: extensoes embutidas do VS Code, extensoes CO e `latex-workshop`.
- `packages/`: bibliotecas internas CO reutilizadas por extensoes.
- `build/`: sistema de build, scripts de empacotamento e pipelines Azure.
- `cli/`: CLI em Rust para launcher/tunnels/update/auth.
- `remote/`: dependencias e runtime de server/web remote.
- `test/`: testes upstream de unidade, integracao, smoke, sanity, browser e MCP.
- `co-tests/`: hub de testes CO com fixtures e runner dedicado.
- `scripts/`: wrappers de execucao, build, test e utilitarios.
- `resources/`: assets do produto.
- `docs/`: documentacao local do fork CO.
- `co-secret/`: dados locais e configs administrativas fora do versionamento.
- `.build/`, `out/`, `out-build/`, `out-vscode/`: artefatos/gerados.
- `.manual-*`, `.tectonic-test/`: areas auxiliares de reproducao local.

## Scripts existentes

### Setup e ambiente

- `npm install`
- `npm ci`
- `npm run fetch-builtin-vsix`
- `scripts/check-secrets.sh`
- `.devcontainer/devcontainer.json` define ambiente dev com desktop-lite e Rust

### Build e watch

- `npm run compile`
- `npm run watch`
- `npm run watch-client`
- `npm run watch-extensions`
- `npm run co:build`
- `npm run co:watch`
- `npm run compile-cli`
- `npm run compile-web`
- `npm run watch-web`
- `npm run gulp vscode-<platform>-<arch>`

### Test

- `npm run test-node`
- `npm run test-browser`
- `npm run smoketest`
- `npm run co:test`
- `npm run co:test:unit`
- `npm run co:test:ext`
- `npm run co:test:diagramador`
- `npm run co:test:diagramador:unit`
- `npm run co:test:diagramador:ext`
- `co-tests/scripts/run-unit.sh`
- `co-tests/scripts/run-ext.sh`
- `co-tests/scripts/run-all.sh`
- `scripts/test.sh`, `scripts/test-integration.sh`, `scripts/test-web-integration.sh`, `scripts/test-remote-integration.sh`

### Lint e hygiene

- `npm run co:lint`
- `npm run eslint`
- `npm run stylelint`
- `npm run hygiene`
- `npm run valid-layers-check`
- `npm run define-class-fields-check`
- `build/package.json -> npm run typecheck`, `npm run test`

### Release e empacotamento

- `npm run gulp vscode-<platform>-<arch>`
- `npm run minify-vscode*`
- `npm run download-builtin-extensions*`
- `npm run update-distro`
- `extensions/latex-workshop/package.json` tem `compile`, `test`, `lint`, `release`

## Workflows e pipelines detectados

### GitHub Actions

- `.github/workflows/build.yml`
  - build matrix Linux/Windows/macOS
  - instala dependencias, baixa built-in VSIX e gera artefatos `../VSCode-*`
- `.github/workflows/co-tests.yml`
  - executa `npm run co:test`
  - detecta genericamente `pnpm`/`yarn`/`npm`, mas neste repo caira em `npm ci`
- `.github/dependabot.yml`
  - atualizacoes semanais apenas para `github-actions`

### Azure Pipelines

- `build/azure-pipelines/product-build.yml`
  - pipeline principal upstream com compile, builds por plataforma, CLI, web e publish opcional
- `build/azure-pipelines/product-publish.yml`
  - publicacao/processamento de artefatos
- `build/azure-pipelines/product-release.yml`
  - release com auth Azure
- `build/azure-pipelines/{linux,win32,darwin,alpine,web,cli}/...`
  - templates de compile, node_modules cache, signing, packaging e smoke/integration tests

Observacao: o fluxo de release real esta claramente no Azure Pipelines. O GitHub Actions deste fork cobre build basico e testes CO, nao assinatura/publicacao completa.

## Testes e cobertura aparente por camada

### Upstream Code-OSS

- `src/vs/*/test/`: cobertura extensa de unidades por camada (`base`, `platform`, `editor`, `workbench`, `server`)
- `test/unit/`: unit tests browser/electron/node
- `test/integration/`: integracao browser/electron
- `test/smoke/`: smoke tests
- `test/sanity/`, `test/mcp/`, `test/automation/`, `test/monaco/`
- `build/lib/test/`: testes dos scripts de build

### Camada CO

- `packages/co-storage-core`: unit tests
- `packages/co-template-core`: unit tests
- `packages/co-preview-core`: unit tests
- `packages/co-doc-core`: nenhum teste encontrado
- `extensions/co-diagramador`: unit + integracao de extensao
- `extensions/co-data-set`: unit + integracao de extensao
- `extensions/co-correcao`: unit pequeno (`paths`) + integracao de extensao
- `extensions/co-shell`: unit (`admins`) + integracao de hooks + integracao de extensao
- `extensions/co-template-generator`: integracao de hooks + integracao de extensao

### LaTeX Workshop vendorizado

- `extensions/latex-workshop/test/units/*`
- `extensions/latex-workshop/test/suites/*`

Observacao: ha uma suite relevante dentro de `latex-workshop`, mas os workflows do repo nao indicam execucao dela no CI atual do fork.

## Pontos sensiveis iniciais

- Autenticacao e rede:
  - `cli/src/auth.rs` implementa device code flow para GitHub e Microsoft.
  - `product.json` ja vem com wiring de Copilot/GitHub auth e Open VSX como gallery.
  - builds/publish usam GitHub token, Azure Key Vault, ESRP e Azure CLI.
- Segredos e configuracao local:
  - `docs/SECRETS.md` e `scripts/check-secrets.sh` definem a convencao de `co-secret/`.
  - `co-shell` usa `coShell.adminsFile` e fallback para `co-secret/config/admins.json`.
  - o checkout atual possui `co-secret/` local; automacoes devem continuar tratando isso como dado fora do versionamento.
- Filesystem e persistencia:
  - CO escreve em `context.globalStorageUri`, `.co/diagramador`, storage compartilhado `co-template-core/templates`, `~/CO-runtime/...` e arquivos JSON de revisao/caches.
  - `co-data-set` cria watchers recursivos sobre workspace, runtime e template dirs.
  - `co-shell` persiste papel do usuario em `globalState`.
- Integracao com editor:
  - extensoes CO usam comandos, views e webviews como superficie principal.
  - `co-shell` tambem altera UI do workbench e pode fechar pasta/workspace em modo student.
- Toolchain LaTeX:
  - `co-template-core` chama `tectonic` e trata bundle offline/cache/snap relocation.
  - `co-shell` usa `latexmk` com fallback `pdflatex`.
  - `co-preview-core` pode usar PDF.js, viewer nativo ou fallback por imagem com `pdftoppm`.
  - `latex-workshop` adiciona outra pilha de build/preview/completion separada.
- Dependencias nativas:
  - Electron, `node-pty`, `kerberos`, watchers nativos, SQLite, OpenSSL para CLI, signing multiplataforma.
- Cobertura desigual:
  - `co-doc-core` sem testes.
  - `co-template-generator` e `co-correcao` parecem menos cobertos em logica central que `co-diagramador`.
  - nao ha workflow GitHub dedicado para `co:lint`.
  - a suite do `latex-workshop` nao aparece integrada ao CI do fork.

## Ordem segura de intervencao

1. Validar ambiente local e baseline:
   - `npm ci`
   - `npm run co:test:unit`
   - `npm run co:test:ext`
2. Tratar primeiro bibliotecas CO compartilhadas:
   - `co-doc-core`
   - `co-storage-core`
   - `co-template-core`
   - `co-preview-core`
3. Depois intervir nas extensoes com menos efeito colateral global:
   - `co-data-set`
   - `co-diagramador`
4. Em seguida mexer em `co-correcao`, que depende do storage do Diagramador e de build/preview.
5. Deixar `co-shell` por ultimo dentro da camada CO:
   - mexe com admins, configuracao local e estado visual do editor
6. Isolar qualquer alteracao em `latex-workshop` numa frente separada:
   - e uma extensao vendorizada com ciclo proprio e toolchain propria
7. Tocar pipelines/release apenas depois da superficie funcional estabilizar:
   - ha risco alto por signing, publish e segredos Azure

## Principais riscos tecnicos iniciais

- Acoplamento via convencoes de caminho e arquivos JSON entre extensoes CO, sem fronteira de API forte.
- Divergencia de comportamentos entre `tectonic`, `latexmk/pdflatex` e o ecossistema do `latex-workshop`.
- Superficie nativa/multiplataforma grande para build e empacotamento.
- CI do fork cobre build e testes CO, mas nao evidencia lint CO e nem a bateria do `latex-workshop`.
- Presenca de storage/local secret data fora do Git aumenta a chance de diferencas entre ambientes se isso nao for explicitamente controlado.
