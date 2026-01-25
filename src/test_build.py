from pathlib import Path
from app import build_pdf

text = "Teste de diagramação.\n\nLinha 2 com símbolos: % $ _ & #\n\nFim."
pdf = build_pdf(text, Path("out.pdf"))
print("OK:", pdf)
