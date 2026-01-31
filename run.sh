#!/bin/bash
echo "🚀 Iniciando CO Diagramador..."

# Check python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 não encontrado."
    exit 1
fi

# Create venv if not exists
if [ ! -d ".venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# Install requirements
echo "⬇️  Instalando dependências..."
pip install -r requirements.txt --quiet

# Start server
echo "✅ Servidor pronto!"
echo "🌐 Acesse: http://localhost:8000"

# Open browser in background (linux)
if command -v xdg-open &> /dev/null; then
    sleep 2
    xdg-open http://localhost:8000
fi

# Run uvicorn
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
