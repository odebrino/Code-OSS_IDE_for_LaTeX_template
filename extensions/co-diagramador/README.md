# CO Diagramador

Extensao interna para montar PDFs de tarefas usando templates LaTeX.

## Requisitos

- Tectonic instalado e acessivel no PATH (ou defina `TECTONIC_PATH`).
- Para bundle offline do Tectonic, configure `co.tectonic.bundlePath`.

## Uso rapido

1. Execute o comando "CO: Abrir Diagramador".
2. Crie uma tarefa, preencha os campos e escolha um template.
3. O PDF e atualizado automaticamente.

## Arquivos e armazenamento

- Dados das tarefas: `.co/diagramador/tasks/*.json` no workspace.
- Saida do PDF: `.co/diagramador/out/preview.pdf`.
- Previa de templates: `.co/diagramador/template-preview/<templateId>/preview.pdf`.
- Se nao houver workspace, o armazenamento usa o `globalStorage` do VS Code.
- Use `CO_SAVE_DIR` para forcar um caminho base.

## Templates

- Templates editaveis ficam no storage global do VS Code em `co-template-core/templates`.
- Templates padrao do repo (somente leitura) ficam em `templates/`.
- Assets ficam em `assets/` dentro do template.
- Campos do tipo `latex` nao sofrem escape, permitindo comandos LaTeX.

## Configuracoes

- `co.diagramador.fastBuild`: usa compilacao rapida (menos reruns).
- `co.tectonic.bundlePath`: caminho para bundle offline do Tectonic.
