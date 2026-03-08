# CO Diagramador

Extensao interna para montar PDFs de tarefas usando templates LaTeX.

## Requisitos

- Tectonic instalado e acessivel no PATH (ou defina `TECTONIC_PATH`).
- Para bundle offline do Tectonic, configure `co.tectonic.bundlePath`.

## Uso rapido

1. Execute o comando "CO: Abrir Diagramador".
2. Na tela principal, clique em `Nova Tarefa`.
3. O modal do webview coleta:
   - nome da tarefa;
   - tipo (`teorica`, `pratica`, `salinha`);
   - template (`tarefa` por padrao, ou `oficio`).
4. A tarefa e aberta automaticamente para edicao.
5. O PDF e atualizado automaticamente.

## Arquivos e armazenamento

- Dados das tarefas: `.co/diagramador/tarefas/*.json` no workspace.
- Em runtime sem workspace, os dados continuam no storage interno do VS Code.
- Saida do PDF do documento: `~/CO-runtime/<perfil>/diagramador/out/preview.pdf` por padrao.
- Previa de templates: `~/CO-runtime/<perfil>/diagramador/template-preview/<templateId>/preview.pdf`.
- Se nao houver workspace, o armazenamento usa o `globalStorage` do VS Code.
- Use `CO_SAVE_DIR` para forcar um caminho base.
- Use `co.runtime.baseDir` ou `CO_RUNTIME_BASE_DIR` para trocar a base visivel do runtime.

## Templates

- Templates editaveis ficam no storage global do VS Code em `co-template-core/templates`.
- Os templates gerenciados `tarefa` e `oficio` sao seedados automaticamente nesse storage compartilhado.
- O comando `CO: Gerenciar Templates` concentra as acoes fora da tela principal task-first.
- Assets ficam em `assets/` dentro do template.
- Campos do tipo `latex` nao sofrem escape, permitindo comandos LaTeX.

## Configuracoes

- `co.diagramador.fastBuild`: usa compilacao rapida (menos reruns).
- `co.runtime.baseDir`: define a base visivel do runtime de build/preview das extensoes CO.
- `co.tectonic.bundlePath`: caminho para bundle offline do Tectonic.

## Notas sobre Snap

- Se o `tectonic` vier de `/snap/bin/tectonic`, o runtime de compilacao nao pode ficar em diretorios ocultos como `~/.config/...` ou `.co/...`.
- O Diagramador realoca automaticamente o runtime para um diretorio visivel quando detecta esse cenário.
- O painel `Build e Preview` mostra a pasta efetiva usada, a base solicitada e o motivo da realocacao.

## Testes

- Completo: `npm run co:test:diagramador`
- Unit: `npm run co:test:diagramador:unit`
- Extensao: `npm run co:test:diagramador:ext`
