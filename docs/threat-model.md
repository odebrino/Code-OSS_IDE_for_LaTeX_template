# Threat Model

Primeira rodada de threat modeling baseada no que o repositório realmente implementa hoje.

## Escopo e evidência

Fluxos priorizados:

1. Build e preview LaTeX em `co-diagramador` e `co-correcao`
2. Persistência local de tarefas, templates e revisões
3. Elevação para modo admin em `co-shell`

Arquivos-base:

- `extensions/co-diagramador/package.json`
- `extensions/co-diagramador/src/extension.ts`
- `extensions/co-diagramador/src/protocol.ts`
- `extensions/co-diagramador/src/webview.ts`
- `extensions/co-correcao/package.json`
- `extensions/co-correcao/src/extension.ts`
- `extensions/co-correcao/src/webview.ts`
- `extensions/co-shell/package.json`
- `extensions/co-shell/src/extension.ts`
- `extensions/co-shell/src/lib/admins.ts`
- `packages/co-template-core/src/index.ts`
- `packages/co-storage-core/src/index.ts`
- `packages/co-preview-core/src/index.ts`
- `packages/co-doc-core/src/index.ts`
- `docs/SECRETS.md`

## Fluxo 1: Build e preview LaTeX

**Ativos**

- arquivos de tarefa e template
- PDFs, logs e artefatos em runtime
- caminho do compilador TeX e bundle offline
- host de extensão e webviews de preview

**Atores**

- usuário legítimo
- autor de workspace/template malicioso
- operador local que controla env/config

**Superfícies de ataque**

- mensagens de webview para `co-diagramador` e `co-correcao`
- importação de template ZIP
- conteúdo LaTeX vindo de template, preview data e revisões
- `TECTONIC_PATH`, `co.tectonic.bundlePath`, `CO_RUNTIME_BASE_DIR`
- fallback para `pdftoppm`

**Principais ameaças**

- conteúdo LaTeX hostil em workspace/template disparar compilação em extensões marcadas como compatíveis com `untrustedWorkspaces`
- payload malformado ou muito grande vindo da webview causar operações inesperadas no host de extensão
- ZIP/asset malicioso tentar sair do diretório alvo ou consumir disco/memória em excesso
- override local de binário/caminho apontar para executável ou diretório inesperado

**Mitigação existente**

- `validateTemplate` restringe manifesto, `id` e `entry` a `main.tex`
- `normalizeAssetPath` bloqueia caminhos absolutos e `..`
- `resolveZipEntryPath` bloqueia Zip Slip
- webviews usam CSP e `localResourceRoots`
- `spawn()` recebe lista de argumentos e evita shell fora do Windows

**Mitigação faltante**

- gate explícito por `workspace.isTrusted` antes de compilar/importar templates
- validação estrutural completa das mensagens de webview; hoje o Diagramador valida basicamente `type`, e o Correção usa `switch` sobre `message?.type`
- limites de tamanho/quantidade para ZIPs, assets e payloads de webview
- validação mais rígida dos overrides locais de executável e diretório

## Fluxo 2: Persistência local de tarefas e revisões

**Ativos**

- `.co/diagramador`, `.co/corrections`, `globalStorageUri`
- JSONs de tarefa, índice e revisões
- diretórios de runtime e preview

**Atores**

- usuário legítimo
- processo local com acesso ao workspace
- autor de conteúdo persistido malformado

**Superfícies de ataque**

- leitura e escrita de paths relativos em `LocalStorageProvider`
- `CO_SAVE_DIR` e resolução de diretórios persistentes/runtime
- IDs de tarefa/revisão e arquivos JSON no workspace

**Principais ameaças**

- corrupção de estado ou perda parcial de dados durante gravação
- escrita/leitura fora do diretório base se um chamador futuro passar path relativo não saneado
- redirecionamento de persistência para locais sensíveis via override de ambiente/config

**Mitigação existente**

- `writeFileAtomic` reduz corrupção em gravações
- `parseProject` e `migrateLegacyProject` normalizam payloads
- `normalizeTaskId` reduz traversal por ID de tarefa
- `resolveCoPersistentPaths` centraliza a política de diretórios

**Mitigação faltante**

- `LocalStorageProvider.resolvePath` não impõe containment check do root
- não há política para recusar `CO_SAVE_DIR`/runtime dirs inseguros ou symlinks inesperados
- faltam testes de segurança específicos para traversal/escape de diretório no storage genérico

## Fluxo 3: Elevação para modo admin no CO Shell

**Ativos**

- decisão de role `student`/`admin`
- lista local de admins
- PDF e log gerados no `globalStorageUri`
- comandos que alteram UI e modo de operação

**Atores**

- admin legítimo
- usuário local sem privilégio
- workspace malicioso tentando influenciar config

**Superfícies de ataque**

- comando `coShell.enterAdminMode`
- configuração `coShell.adminsFile`
- arquivos `co-secret/config/admins.json` e templates
- webview `generatePdf`

**Principais ameaças**

- elevação local para admin por manipulação do arquivo de admins ou da configuração `coShell.adminsFile`
- uso de caminho relativo com `..` em `coShell.adminsFile` para sair do diretório esperado
- workspace não confiável influenciar a origem do arquivo de admins

**Mitigação existente**

- admins não ficam hardcoded no repo
- `co-secret/` é ignorado no Git e documentado como local-only
- fallback seguro para template vazio/sem admins
- normalização de email para comparação
- entradas textuais do PDF passam por escaping básico de LaTeX

**Mitigação faltante**

- tratar `coShell.adminsFile` como configuração somente de usuário/aplicação, não de workspace
- validar containment do caminho configurado ou limitar a allowlist (`co-secret/` ou caminho absoluto explícito)
- registrar evento/auditoria local ao entrar em admin mode
- autenticação mais forte que whitelist de email, se esse fluxo sair do modo estritamente local

## Matriz curta de risco

| ID | Risco | Severidade | Prioridade |
| --- | --- | --- | --- |
| TM-01 | Compilação de LaTeX/template em workspace não confiável sem trust gate explícito | Alta | P1 |
| TM-02 | `coShell.adminsFile` pode apontar para caminho arbitrário e favorecer elevação local para admin | Alta | P1 |
| TM-03 | Mensagens de webview sem schema validation forte no host de extensão | Média | P1 |
| TM-04 | `LocalStorageProvider` não impõe containment do diretório base | Média | P2 |
| TM-05 | Importação de ZIP/assets sem limites de tamanho/quantidade | Média | P2 |
| TM-06 | Overrides locais (`TECTONIC_PATH`, `CO_SAVE_DIR`, runtime dirs) aceitam caminhos arbitrários | Baixa a média | P3 |

## Backlog de mitigação

| ID | Tarefa concreta | Prioridade | Área |
| --- | --- | --- | --- |
| TM-01 | Bloquear build/import de templates em `co-diagramador` e `co-correcao` quando `workspace.isTrusted === false`, com mensagem clara e override explícito apenas se realmente necessário | P1 | `extensions/co-diagramador`, `extensions/co-correcao` |
| TM-02 | Mudar `coShell.adminsFile` para escopo somente usuário/aplicação e rejeitar paths relativos com escape (`..`) | P1 | `extensions/co-shell/package.json`, `extensions/co-shell/src/lib/admins.ts` |
| TM-03 | Introduzir validadores de mensagem por comando para Diagramador/Correção e rejeitar payloads fora do contrato esperado | P1 | `extensions/co-diagramador/src/protocol.ts`, `extensions/co-correcao/src/extension.ts` |
| TM-04 | Endurecer `LocalStorageProvider.resolvePath` para garantir que todo path resolvido permaneça sob `baseDir`; cobrir com testes | P2 | `packages/co-storage-core` |
| TM-05 | Adicionar limites de tamanho/quantidade na importação de ZIP e assets base64 antes de extrair/copiar | P2 | `extensions/co-diagramador/src/extension.ts` |
| TM-06 | Validar e logar de forma segura overrides de executável/runtime (`TECTONIC_PATH`, `CO_SAVE_DIR`, `co.runtime.baseDir`) | P3 | `packages/co-template-core`, `packages/co-storage-core`, extensões CO |
| TM-07 | Adicionar testes de regressão de segurança para traversal em ZIP, assets, storage e admins path | P2 | `extensions/co-diagramador`, `extensions/co-shell`, `packages/co-storage-core` |

## Próxima intervenção segura

1. Fechar `TM-02` e `TM-04`, porque são localizados e de baixo risco arquitetural.
2. Fechar `TM-01` e `TM-03`, porque protegem a fronteira mais exposta entre workspace/webview e host.
3. Endurecer quotas e overrides (`TM-05`, `TM-06`) depois que os gates de confiança e path containment estiverem ativos.
