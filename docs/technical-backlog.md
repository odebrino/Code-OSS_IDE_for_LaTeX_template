# Technical Backlog

Backlog factual derivado do estado atual do repositório e das mudanças já feitas até `2026-03-12`.

Fontes principais:

- [initial-audit.md](./initial-audit.md)
- [architecture.md](./architecture.md)
- [threat-model.md](./threat-model.md)
- [dependency-inventory.md](./dependency-inventory.md)
- [vulnerability-backlog.md](./vulnerability-backlog.md)
- [release.md](./release.md)

## Escala

- Impacto: `H` bloqueia fluxo central, CI/release ou reduz risco material; `M` melhora área importante mas localizada; `L` é oportunista.
- Urgência: `Now` próxima sprint, `Next` próximas 2-3 sprints, `Later` depois de estabilizar a base atual.
- Risco: risco de regressão/efeito colateral da implementação.
- Esforço: `S` até 1 dia, `M` 2-5 dias, `L` maior que uma sprint curta ou com várias superfícies.

## Quick Wins

| ID | Tarefa | Categoria | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SEC-1.2-T1` | Tornar `coShell.adminsFile` configuração somente de usuário/aplicação | Segurança | H | Now | L | S | - |
| `SEC-1.1-T1` | Bloquear build/import no Diagramador em workspace não confiável | Segurança | H | Now | M | S | - |
| `SEC-1.1-T2` | Bloquear build no Correção em workspace não confiável | Segurança | H | Now | M | S | `SEC-1.1-T1` |
| `STAB-1.1-T1` | Validar e recusar overrides inseguros de `CO_SAVE_DIR`, `CO_RUNTIME_BASE_DIR` e `co.runtime.baseDir` | Estabilidade | H | Now | M | S | - |
| `SEC-2.1-T1` | Adicionar limites de tamanho/quantidade na importação ZIP/assets do Diagramador | Segurança | H | Now | M | M | - |
| `DX-2.1-T1` | Publicar logs/artifacts úteis do `CO CI` em falha | DX/Maintainability | M | Now | L | S | - |

## Estabilidade

### Epic `STAB-1`: Persistência e recovery determinísticos

Impacto `H` | Urgência `Now` | Risco `M` | Esforço `M`  
Evidência: múltiplos caminhos de persistência e acoplamento por filesystem em [initial-audit.md](./initial-audit.md), além dos endurecimentos recentes em `co-storage-core`, `co-template-core` e `co-correcao`.

#### Feature `STAB-1.1`: Política segura para roots de runtime e storage

Impacto `H` | Urgência `Now` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `STAB-1.1-T1` | Validar e recusar overrides inseguros de `CO_SAVE_DIR`, `CO_RUNTIME_BASE_DIR` e `co.runtime.baseDir`, com log contextual seguro | H | Now | M | S | - |
| `STAB-1.1-T2` | Adicionar política explícita para symlinks e escapes em roots persistentes/runtime em `co-storage-core` | H | Now | M | M | `STAB-1.1-T1` |
| `STAB-1.1-T3` | Cobrir com testes casos de symlink, path absoluto inesperado e relocation de runtime | M | Now | L | S | `STAB-1.1-T2` |

#### Feature `STAB-1.2`: Recovery de estado corrompido sem comportamento imprevisível

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `STAB-1.2-T1` | Detectar e isolar JSON inválido de tarefas do Diagramador, em vez de apenas ignorar silenciosamente | H | Next | M | M | - |
| `STAB-1.2-T2` | Sanitizar e regravar `.preview-cache.json` e `.assets-cache` quando houver corrupção leve | M | Next | L | S | - |
| `STAB-1.2-T3` | Adicionar testes de regressão para task JSON inválido, cache corrompido e mismatch entre base/index/revision | M | Next | L | S | `STAB-1.2-T1`, `STAB-1.2-T2` |

### Epic `STAB-2`: Execução LaTeX previsível entre fluxos

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `L`  
Evidência: coexistência de `tectonic`, `latexmk/pdflatex` e `pdftoppm` em [initial-audit.md](./initial-audit.md) e [architecture.md](./architecture.md).

#### Feature `STAB-2.1`: Preflight e diagnóstico consistentes da toolchain

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `STAB-2.1-T1` | Criar checagem unificada de capabilities para `tectonic`, `latexmk/pdflatex` e `pdftoppm` antes do build/preview | H | Next | M | M | - |
| `STAB-2.1-T2` | Normalizar taxonomy de erros entre `co-template-core`, `co-shell` e preview fallback | H | Next | M | M | `STAB-2.1-T1` |
| `STAB-2.1-T3` | Adicionar testes opt-in para ambiente com TeX real, fora do gate padrão do CI | M | Later | M | M | `STAB-2.1-T2` |

## Segurança

### Epic `SEC-1`: Fronteiras de workspace e privilégio local

Impacto `H` | Urgência `Now` | Risco `M` | Esforço `M`  
Evidência: [threat-model.md](./threat-model.md) `TM-01`, `TM-02`, `TM-03`.

#### Feature `SEC-1.1`: Trust gate para build/import LaTeX

Impacto `H` | Urgência `Now` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `SEC-1.1-T1` | Bloquear build/import no Diagramador quando `workspace.isTrusted === false`, com mensagem clara | H | Now | M | S | - |
| `SEC-1.1-T2` | Bloquear build no Correção quando `workspace.isTrusted === false`, com mensagem consistente com o Diagramador | H | Now | M | S | `SEC-1.1-T1` |
| `SEC-1.1-T3` | Adicionar cobertura unit/integration para trust gate e mensagens ao usuário | M | Now | L | S | `SEC-1.1-T1`, `SEC-1.1-T2` |

#### Feature `SEC-1.2`: Hardening do modo admin no CO Shell

Impacto `H` | Urgência `Now` | Risco `L` | Esforço `S`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `SEC-1.2-T1` | Tornar `coShell.adminsFile` configuração somente de usuário/aplicação em `package.json` da extensão | H | Now | L | S | - |
| `SEC-1.2-T2` | Restringir lookup do arquivo de admins a caminho absoluto explícito ou `co-secret/`, sem aceitar origem de workspace | H | Now | L | S | `SEC-1.2-T1` |
| `SEC-1.2-T3` | Registrar auditoria local ao entrar em admin mode sem logar email/token bruto | M | Next | L | S | `SEC-1.2-T2` |

### Epic `SEC-2`: Hardening de entrada e limites operacionais

Impacto `H` | Urgência `Now` | Risco `M` | Esforço `M`  
Evidência: superfícies ZIP, assets e mensagens de webview em [threat-model.md](./threat-model.md).

#### Feature `SEC-2.1`: Quotas para importação e payload

Impacto `H` | Urgência `Now` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `SEC-2.1-T1` | Adicionar limites de tamanho, contagem de arquivos e volume extraído na importação ZIP/assets do Diagramador | H | Now | M | M | - |
| `SEC-2.1-T2` | Limitar tamanho e frequência de payloads de webview além da validação estrutural já existente | M | Next | M | M | - |
| `SEC-2.1-T3` | Criar testes de regressão para traversal, ZIP oversize e payload malicioso | H | Next | L | M | `SEC-2.1-T1`, `SEC-2.1-T2` |

### Epic `SEC-3`: Paridade de supply chain e dependências críticas

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `M`  
Evidência: [dependency-inventory.md](./dependency-inventory.md) e [vulnerability-backlog.md](./vulnerability-backlog.md).

#### Feature `SEC-3.1`: Fechar gaps fora do gate npm atual

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `SEC-3.1-T1` | Adicionar inventário e auditoria de Cargo para `cli/` e `build/win32/` com backlog dedicado | H | Next | L | M | - |
| `SEC-3.1-T2` | Revisar dependências Git em `cli/Cargo.toml` (`tunnels`, `russh*`) e documentar pinning ou plano de substituição | H | Next | M | M | `SEC-3.1-T1` |
| `SEC-3.1-T3` | Aplicar atualizações lockfile-only seguras no grafo `build/` (`fast-xml-parser`, `@electron/rebuild`, `app-builder-lib`, `dmg-builder`) | M | Next | M | M | - |
| `SEC-3.1-T4` | Planejar upgrade controlado da cadeia `gulp`/`copy-webpack-plugin` do root só depois de baseline de testes do build aumentar | H | Later | H | L | `DX-1.1-T1`, `DX-2.1-T1` |

## DX / Maintainability

### Epic `DX-1`: Cobertura de testes nas superfícies CO menos protegidas

Impacto `M` | Urgência `Next` | Risco `L` | Esforço `M`  
Evidência: lacunas citadas em [initial-audit.md](./initial-audit.md), [CO.md](../CO.md) e nas mudanças recentes de smoke/observability.

#### Feature `DX-1.1`: Expandir smoke e integration tests de alto valor

Impacto `M` | Urgência `Next` | Risco `L` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `DX-1.1-T1` | Adicionar smoke mínimo para `co-shell` cobrindo seleção de role e abertura básica da view | M | Next | M | M | - |
| `DX-1.1-T2` | Adicionar smoke mínimo para `co-data-set` cobrindo scan roots e estado inicial da extensão | M | Next | M | M | - |
| `DX-1.1-T3` | Adicionar testes da integração `co-template-generator` no fluxo oficial `co:test:unit` ou `co:test:smoke` | M | Next | L | S | - |

#### Feature `DX-1.2`: Cobertura de recuperação e overrides

Impacto `M` | Urgência `Next` | Risco `L` | Esforço `S`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `DX-1.2-T1` | Adicionar testes unitários para overrides de runtime/toolchain aceitos e rejeitados | M | Next | L | S | `STAB-1.1-T1` |
| `DX-1.2-T2` | Adicionar testes para observabilidade básica do `co-shell` e caminhos de erro úteis ao usuário | M | Next | L | S | `DX-1.1-T1` |

### Epic `DX-2`: CI mais diagnóstica e barata de operar

Impacto `M` | Urgência `Now` | Risco `L` | Esforço `M`  
Evidência: `CO CI` e `Build Artifacts` atuais em `.github/workflows/`.

#### Feature `DX-2.1`: Diagnóstico em falhas de automação

Impacto `M` | Urgência `Now` | Risco `L` | Esforço `S`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `DX-2.1-T1` | Publicar `build.log`, output channels e logs de extensão como artifacts em falhas do `CO CI` | M | Now | L | S | - |
| `DX-2.1-T2` | Anexar relatório do smoke quando `co:test:smoke` falhar, sem aumentar muito o custo do job | M | Now | L | S | `DX-2.1-T1` |

#### Feature `DX-2.2`: Revisão de custo da pipeline

Impacto `M` | Urgência `Later` | Risco `L` | Esforço `S`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `DX-2.2-T1` | Medir tempo médio de `CO CI` por etapa e só então decidir se vale separar qualidade/testes em jobs distintos | M | Later | L | S | - |

## Arquitetura

### Epic `ARCH-1`: Reduzir acoplamento por convenção de filesystem

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `L`  
Evidência: acoplamento via `.co/`, tarefas, templates e revisões em [architecture.md](./architecture.md) e [initial-audit.md](./initial-audit.md).

#### Feature `ARCH-1.1`: Contrato explícito dos formatos persistidos

Impacto `H` | Urgência `Next` | Risco `M` | Esforço `M`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `ARCH-1.1-T1` | Documentar contrato on-disk de tarefas, templates, `base.json`, `index.json` e `rev-*.json` com fixtures versionadas | H | Next | L | M | - |
| `ARCH-1.1-T2` | Reutilizar as mesmas fixtures entre Diagramador, Correção e `co-template-core` para detectar drift de formato | H | Next | M | M | `ARCH-1.1-T1` |
| `ARCH-1.1-T3` | Avaliar mover normalizadores de persistência compartilhados para um pacote comum se surgir segundo consumidor real | M | Later | M | M | `ARCH-1.1-T2` |

### Epic `ARCH-2`: Clarificar ownership da toolchain LaTeX

Impacto `M` | Urgência `Next` | Risco `M` | Esforço `M`  
Evidência: três pilhas de execução paralelas em [architecture.md](./architecture.md).

#### Feature `ARCH-2.1`: Matriz de responsabilidade por fluxo

Impacto `M` | Urgência `Next` | Risco `L` | Esforço `S`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `ARCH-2.1-T1` | Registrar qual fluxo usa `tectonic`, qual usa `latexmk/pdflatex` e qual delega a `latex-workshop` | M | Next | L | S | - |
| `ARCH-2.1-T2` | Definir quais mudanças em `latex-workshop` exigem trilha separada no backlog e no CI | M | Next | L | S | `ARCH-2.1-T1` |

## Release / Ops

### Epic `OPS-1`: Fechar o ciclo do artifact bundle do GitHub

Impacto `M` | Urgência `Next` | Risco `L` | Esforço `M`  
Evidência: baseline recente em [release.md](./release.md) e [build.yml](../.github/workflows/build.yml).

#### Feature `OPS-1.1`: Operacionalizar checksum e attestation

Impacto `M` | Urgência `Next` | Risco `L` | Esforço `S`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `OPS-1.1-T1` | Confirmar suporte de artifact attestation no ambiente real do repositório e setar `ENABLE_PRIVATE_ARTIFACT_ATTESTATION=true` se aplicável | M | Next | L | S | - |
| `OPS-1.1-T2` | Adicionar script `co:release:verify` para validar checksum local e, quando configurado, orientar verificação de attestation | M | Next | L | S | `OPS-1.1-T1` |
| `OPS-1.1-T3` | Anexar SBOM npm já gerado ao bundle de release ou referenciá-lo no manifesto de build | M | Next | L | M | - |

### Epic `OPS-2`: Paridade mínima com o release final do Azure

Impacto `H` | Urgência `Later` | Risco `H` | Esforço `L`  
Evidência: signing/publish continuam em `build/azure-pipelines/`.

#### Feature `OPS-2.1`: Rastreabilidade dos artefatos assinados

Impacto `H` | Urgência `Later` | Risco `H` | Esforço `L`

| ID | Tarefa atômica | Impacto | Urgência | Risco | Esforço | Depende de |
| --- | --- | --- | --- | --- | --- | --- |
| `OPS-2.1-T1` | Propagar checksum/manifest naming do GitHub bundle para os artifacts finais processados no Azure | H | Later | H | M | `OPS-1.1-T3` |
| `OPS-2.1-T2` | Adicionar proveniência/attestation ou metadado equivalente para assets finais assinados do Azure | H | Later | H | L | `OPS-2.1-T1` |
| `OPS-2.1-T3` | Publicar runbook curto de rollback com mapeamento entre commit, bundle GitHub, artifact Azure e release final | M | Later | M | S | `OPS-2.1-T1` |

## Dependências cruzadas mais importantes

- `SEC-1.1-T1` antes de `SEC-1.1-T2` para manter a mesma política de trust gate nas duas extensões centrais.
- `SEC-1.2-T1` antes de `SEC-1.2-T2` porque a origem de configuração precisa ser reduzida antes do hardening de path.
- `STAB-1.1-T1` antes de `DX-1.2-T1` para que os testes cubram a política final de overrides.
- `DX-2.1-T1` antes de `SEC-3.1-T4` para que upgrades mais arriscados do build tenham melhor diagnóstica.
- `ARCH-1.1-T1` antes de `ARCH-1.1-T2` para evitar fixtures duplicadas sem contrato explícito.
- `OPS-1.1-T3` antes de `OPS-2.1-T1` se o Azure passar a carregar SBOM/manifest junto do artifact final.

## Próxima sprint técnica recomendada

Objetivo da próxima sprint: fechar os gaps localizados de maior impacto no fluxo CO sem abrir frentes grandes de refactor ou release.

Escopo recomendado:

1. `SEC-1.2-T1`
2. `SEC-1.2-T2`
3. `SEC-1.1-T1`
4. `SEC-1.1-T2`
5. `STAB-1.1-T1`
6. `DX-2.1-T1`

Resultado esperado:

- builds/imports mais seguros em workspace não confiável
- menor risco de elevação local indevida no `co-shell`
- configuração/runtime com defaults mais previsíveis
- falhas de CI mais fáceis de diagnosticar
