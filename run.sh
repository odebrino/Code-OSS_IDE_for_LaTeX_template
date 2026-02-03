#!/bin/bash
echo "Iniciando CO Diagramador (modo local)..."

# Check python
if ! command -v python3 &> /dev/null; then
    echo "Python3 nao encontrado."
    exit 1
fi

# Create venv if not exists
if [ ! -d ".venv" ]; then
    echo "Criando ambiente virtual..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# Install requirements (se existir algo extra)
echo "Instalando dependencias..."
pip install -r requirements.txt --quiet

# Run local app
echo "Abrindo interface local..."
python src/app.py
