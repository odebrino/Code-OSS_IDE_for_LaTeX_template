# Diagramador (modo local)

App local: cola texto e gera PDF usando um template LaTeX fixo.

## Requisitos
- Python 3.10+
- tectonic (binario local)
  - Ubuntu: `sudo snap install tectonic`

## Estrutura
- `src/app.py`: interface local (Tkinter).
- `src/core/`: compilacao LaTeX e utilitarios.
- `templates/plain/template.tex`: template simples usado pelo app.
- `templates/tarefa_03/`: template mais complexo (guardado para futura expansao).
- `storage/`: dados locais (tarefas, templates, indices).

## Storage local
Por padrao, os dados ficam em `storage/` na raiz do projeto.
Para usar uma pasta sincronizada (Drive/OneDrive), defina a variavel de ambiente:

```
CO_STORAGE_ROOT=/caminho/para/pasta
```

## Rodar

```
./run.sh
```

Teste rapido:

```
python src/test_build.py
```

Se preferir rodar manualmente sem o script:

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python src/app.py
```
